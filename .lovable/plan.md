
# Turn the app into a multi-tenant SaaS

Today everything (items, dealers, customers, purchases, sales, expenses, user_roles) belongs to one shared pool — every signed-in user sees Pioneer's data. We'll add a **Business** (tenant) layer so each family member / shop owner has their own isolated workspace, and can be invited into others.

## What changes for the user

1. **Sign up** → choice screen: *Create a new business* or *I'm waiting for an invite*.
2. **Create business** → name + optional phone/address → they become its **owner (admin)**, app loads with empty data.
3. **Business switcher** in the header → shows all businesses the user belongs to + "Create new business". Switching reloads all lists scoped to that business.
4. **Users page → Members page** (per-business): owner/admin invites people by email, assigns role (admin/editor/viewer), can revoke.
5. **Invited user** → if they have an account, the business shows up in their switcher immediately; if not, the invite email links them to signup, after which they're auto-added.
6. **Existing Pioneer data** → migrated as a single business named "Pioneer Enterprises", current admin becomes its owner, every current user becomes a member with their current role.
7. **Branding** → rename app to a generic name (proposing **"ShopDesk"** — confirm or give your own). Each business's own name shows inside the app header / page titles / bills.

## Technical plan

### 1. Database migration (one migration)

New tables:
- `businesses` — `id, name, phone, address, owner_id (auth.users), created_at, updated_at`
- `business_members` — `id, business_id, user_id, role (admin|editor|viewer), created_at`, unique `(business_id, user_id)`
- `business_invites` — `id, business_id, email (lowercased), role, token, invited_by, expires_at, accepted_at`

Schema changes to existing tables: add `business_id uuid not null references businesses(id) on delete cascade` to **items, dealers, customers, purchases, sales, expenses, app_settings**. (`sale_lines` inherits via its parent sale.) Index `business_id` on each.

`user_roles` is replaced by `business_members` (role is now per-business, not global). Drop `user_roles` and the legacy `has_role/can_write/is_approved` helpers after data migration.

New security-definer helpers (avoid RLS recursion):
- `is_business_member(_uid, _bid) returns boolean`
- `business_role(_uid, _bid) returns text` (returns 'admin'/'editor'/'viewer'/null)
- `can_write_business(_uid, _bid)` → role in ('admin','editor')
- `is_business_admin(_uid, _bid)` → role = 'admin'

Replace every existing RLS policy on the seven scoped tables with:
- SELECT: `is_business_member(auth.uid(), business_id)`
- INSERT: `can_write_business(auth.uid(), business_id)` and `created_by = auth.uid()`
- UPDATE/DELETE: owner of row OR `is_business_admin(auth.uid(), business_id)`

`sale_lines` policies derive `business_id` via the parent sale (subquery on `sales`).

Policies for new tables:
- `businesses`: SELECT if member; UPDATE if admin; INSERT by any authenticated (with `owner_id = auth.uid()`); DELETE owner only.
- `business_members`: SELECT if member of same business; INSERT/UPDATE/DELETE admin of that business only (admins cannot demote/remove themselves if last admin — enforced via trigger).
- `business_invites`: SELECT/INSERT/UPDATE/DELETE admin of that business.

GRANT blocks for every new public table to `authenticated` + `service_role`.

Triggers:
- `businesses` BEFORE INSERT → auto-insert matching `business_members` row (owner as admin).
- Prevent removing the last admin from a business.
- `set_updated_at` on `businesses`.

Update `handle_new_user`: stops auto-creating any role. Just creates the profile. Business creation happens in-app.

### 2. Data migration step (same migration, after schema)

```text
1. Create business 'Pioneer Enterprises', owner = the existing admin in user_roles.
2. business_id := that business's id.
3. UPDATE items/dealers/customers/purchases/sales/expenses/app_settings SET business_id = <id>.
4. Insert every existing user_roles row into business_members(business_id, user_id, role)
   mapping admin→admin, editor→editor, viewer→viewer.
5. Make columns NOT NULL once backfilled.
6. DROP user_roles table and old helper functions.
```

### 3. Frontend changes

**New `useBusiness()` context** (`src/lib/business.tsx`):
- Loads `business_members` for the current user → list of businesses.
- Stores `currentBusinessId` in `localStorage` (`activeBusinessId`).
- Exposes `{ businesses, current, role, switchTo, refresh }`.
- `role` here replaces today's global `useAuth().role`.

**Scope every query**: `src/lib/store.ts` (and any direct `supabase.from(...)` reads in `users.tsx`, loaders, etc.) must `.eq('business_id', current.id)` for selects and include `business_id: current.id` on inserts. Centralize this in the store layer — components keep calling `useDB()` / `setDB()` unchanged.

**New routes**:
- `/onboarding` — choice screen after signup (Create business / Waiting for invite). Required when the user has zero memberships.
- `/business/new` — create-business form.
- `/business/settings` — rename, address, phone, delete (admin only).
- `/members` (renamed from `/users`) — list business members, invite by email, change role, revoke. Scoped to current business.
- `/invite/$token` — accept-invite landing page; if logged out, redirects to `/auth?invite=<token>`.

**Header changes** (`AppLayout`):
- Add `BusinessSwitcher` dropdown next to the title showing current business name + chevron, listing other memberships and a "+ New business" item.
- App title becomes `${currentBusiness.name}` (fallback to product name).

**Auth route**:
- After login, if user has zero memberships → redirect `/onboarding`; else if `activeBusinessId` not set → set to first; redirect `/`.
- Strip Pioneer branding from auth page → use new generic name.
- Honor `?invite=<token>` after login by auto-accepting.

**Branding sweep**:
- Replace "Pioneer Enterprises" hardcoded strings in route `head()` titles, `index.html`, sign-in card, etc. with the new product name. Per-business name shown inside the app pulls from `useBusiness().current.name`.

### 4. Invitations

Two-server-fn flow in `src/lib/invites.functions.ts`:
- `createInvite({ businessId, email, role })` — admin-only via `requireSupabaseAuth` + `is_business_admin` check; inserts a row in `business_invites` with a random token, 14-day expiry. Returns a shareable URL `${origin}/invite/${token}`. (No email sending in v1 — admin copies the link and shares manually. Email sending can be a follow-up.)
- `acceptInvite({ token })` — `requireSupabaseAuth`; validates token + expiry + email matches `auth.users.email`; inserts `business_members`; marks invite accepted.

### 5. Sheets backup (`src/lib/sheets.functions.ts`)

Sheets backup currently writes to a single workspace spreadsheet. Make it per-business: store the spreadsheet id in `businesses.sheets_spreadsheet_id` (added in the migration). The mirror function reads the row's `business_id`, looks up that business's sheet, and skips silently if none. The "Initialize Sheets backup" button moves to `/business/settings`.

### 6. Cleanup

- Delete the old `/users` route (replaced by `/members`).
- Remove `useAuth().role` callers and switch them to `useBusiness().role`.
- Update `AdminDelete` and other role gates to use the per-business role.
- Update `security-memory` to reflect that `user_roles` is gone and `business_members` is the new authority.

## Testing checklist

1. New email signs up → lands on `/onboarding` → creates "Test Shop" → empty dashboard.
2. Adds an item; second new user signs up → cannot see "Test Shop" or its items.
3. First user invites second user as editor → copies link → second user opens link while logged in → "Test Shop" appears in their switcher.
4. Second user switches to "Test Shop" → sees the item, can add a sale.
5. Existing Pioneer admin logs in → sees "Pioneer Enterprises" pre-selected with all old data intact; existing editor/viewer accounts work as before.
6. Admin demotes another admin / tries to remove the last admin → blocked by trigger.
7. Switching businesses reloads items/dealers/customers/sales/purchases/expenses correctly with no leakage.

## Files touched (high-level)

- new migration `supabase/migrations/<ts>_multi_tenant.sql`
- new: `src/lib/business.tsx`, `src/lib/invites.functions.ts`
- new routes: `src/routes/onboarding.tsx`, `src/routes/business.new.tsx`, `src/routes/business.settings.tsx`, `src/routes/members.tsx`, `src/routes/invite.$token.tsx`
- edited: `src/lib/store.ts`, `src/lib/auth.tsx`, `src/lib/sheets.functions.ts`, `src/components/AppLayout.tsx`, `src/routes/__root.tsx`, `src/routes/auth.tsx`, `src/routes/_authenticated/route.tsx`, `index.html`, all route `head()` titles, `src/routes/users.tsx` → removed.

## One thing to confirm before I build

**Product name.** I'm suggesting **"ShopDesk"** for the generic SaaS branding (sign-in page, browser title, emails). If you'd prefer a different name, tell me now and I'll use it everywhere.
