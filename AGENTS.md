# AGENTS.md

Guidance for AI coding agents working in this repository. See [README.md](README.md) for the full project overview.

## What this is

Shop inventory & billing app: TanStack Start (React 19) + Supabase (Postgres/RLS/Auth), deployed to Cloudflare Workers. Single business domain: items, purchases, sales (+ GST bills), expenses, dealers/customers, multi-user businesses with invites.

## Commands

```bash
npm run dev          # dev server on http://localhost:8080 (Node 22+)
npm run build        # production build — use this as the "does it compile" check
npx tsc --noEmit     # typecheck
npm run lint         # ESLint (many pre-existing prettier findings; don't try to fix them all)
npm run format       # Prettier --write
```

There is no test suite. Verify changes with `npx tsc --noEmit` and `npm run build`, and by exercising the affected flow in the dev server when possible.

## Architecture rules

- **Data access goes through the store.** Components call `useDB()` to read and `setDB(updater)` to write ([src/lib/store.ts](src/lib/store.ts)). The store diffs the updater result against the current snapshot and issues Supabase mutations, then invalidates TanStack Query caches. Do NOT call `supabase.from(...)` directly from route components — add capability to the store instead. (Exceptions that already exist: auth, business management, members/invites.)
- **Payments ledger invariant.** Sale-linked `payments` rows are created ONLY by the store (from `amountPaid` deltas in the SALES diff section). UI code adds standalone entries (`saleId: null`) to `db.payments` and never edits sale-linked ones — otherwise the khata and per-sale paid figures drift apart. Party balances come from `partyBalance()`/`customerLedger()`/`dealerLedger()`, never ad-hoc sums.
- **Stock math includes adjustments.** Stock = purchases + `stock_adjustments` − sales, both in `stockOf()`/`stockAvailableFor()` and in the DB `enforce_sale_line_stock` trigger. If you touch one side, touch the other.
- **Bill numbers are DB-assigned.** `sales.bill_no` is set by the `assign_bill_no` trigger when `is_bill` becomes true; the client never writes it. Display via `billNoLabel()` (falls back to a UUID slice for pre-numbering sales).
- **GST is snapshotted, split by state code.** Sale lines copy the item's GST slab into `sale_lines.gst_rate` at save time (`null` = legacy line taxed at the sale-level rate) — never recompute historical invoices from the current catalog. `gstAmount()`/`gstSplit()`/`gstRateSummary()` in store.ts are the only tax math; the CGST+SGST vs IGST decision comes from `isInterState(shop.gstin, customer.gstin)` (first two GSTIN digits = state code).
- **Server-only code** lives in `*.functions.ts` files using `createServerFn` (see [invites.functions.ts](src/lib/invites.functions.ts), [sheets.functions.ts](src/lib/sheets.functions.ts)), with auth enforced via `requireSupabaseAuth` middleware. Secrets (`LOVABLE_API_KEY`, `GOOGLE_SHEETS_API_KEY`) are only readable there.
- **Routing is file-based.** Add a route by creating `src/routes/<name>.tsx`; the dev server/build regenerates `src/routeTree.gen.ts`. Never hand-edit `routeTree.gen.ts`. Bills are created and edited on the full-page composer at `/sales/new` ([sales_.new.tsx](src/routes/sales_.new.tsx) — the `_` keeps it out of the `/sales` list's layout); `/sales` is the list only. Deep links: `/sales/new?edit=<id>`, `/items?filter=low|out`, `/items?new=1`, `/directory?tab=customers|dealers&party=<id>`, `/directory?new=1`, `/purchases?new=1`, `/expenses?new=1`, and the mobile quick-entry screen `/entry?type=purchase|expense|in|out[&party=<id>]` ([entry.tsx](src/routes/entry.tsx)).
- **Database changes** require a new SQL file in `supabase/migrations/` (timestamped filename, like the existing ones) including RLS policies — every table is business-scoped and RLS-protected. Update [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts) to match.
- **Vite config**: `@lovable.dev/vite-tanstack-config` already bundles the TanStack Start, React, Tailwind, path-alias, and Cloudflare plugins — do not add them again in [vite.config.ts](vite.config.ts) or the build breaks with duplicate plugins.
- **Two wrangler configs are intentional**: `wrangler.jsonc` (dev) vs `wrangler.deploy.jsonc` (CI deploy). Keep their `vars` in sync if you touch either.
- **PWA / Android (TWA) files live in `public/`** and ship as Cloudflare static assets: `manifest.json`, `sw.js` (hand-written; never cache HTML or `/_serverFn/`; bump `CACHE_VERSION` when changing it), `offline.html`, `_headers`, `.well-known/assetlinks.json` (signing-cert fingerprints; must match `android/twa-manifest.json`), `icons/` (regenerate with `node scripts/gen-icons.mjs`). Registration and the install prompt are in [src/lib/pwa.ts](src/lib/pwa.ts). `/privacy` is a public route (listed in `publicPaths` in `__root.tsx`) that the Play listing links to.

## UI conventions

- Use existing primitives from `src/components/ui/` (shadcn/ui). The set is pruned to what's actually used — if you need a new shadcn component, add it via the standard shadcn template and also add its Radix dependency to package.json.
- [pe.tsx](src/components/ui/pe.tsx) holds the custom "Pioneer Enterprises" design primitives (avatars, badges, tones, plus the Emerald-redesign set: `PeTitle`, `PeCard`, `PeCardHead`, `PeTable`/`PeTHead`/`PeTRow`, `PeFilterPill`, `PeSegmented`, `PeModePicker`, `PeBtn`, `PeStep`, `PeMoneyInput`) used across redesigned screens — prefer these for list/card screens so the look stays consistent.
- **Shell**: [AppLayout.tsx](src/components/AppLayout.tsx) is a dark top bar (`--pe-header`, per-accent) with grouped tab navigation on desktop, a Ctrl+K search palette, an alerts bell, and a gold "New bill" call-to-action (`--pe-gold`); mobile keeps the bottom nav + centered FAB. Design source: "BW Inventory Redesign B — Emerald".
- **Light mode only** — dark theme was removed deliberately (commit f08f56d). Accent colours are configured in [src/lib/theme.tsx](src/lib/theme.tsx) via CSS variables (`--pe-*`); the same table is duplicated in [TweaksPanel.tsx](src/components/TweaksPanel.tsx) and in `THEME_INIT_SCRIPT` — keep all three in sync. Font is IBM Plex Sans (loaded in `__root.tsx`).
- Mobile matters: pages have dedicated mobile card layouts and a bottom nav + centered FAB in [AppLayout.tsx](src/components/AppLayout.tsx). Any new list screen needs both desktop and mobile presentations. A page can replace the mobile top bar with its own dark header by rendering `<MobileHeader>` (from AppLayout; `hideNav` also hides the bottom nav for full-screen flows like the bill composer and `/entry`). The FAB opens the "What do you want to add?" sheet (design source: "BW Inventory Mobile — Emerald").
- Toasts via `toast(...)` from `sonner`; icons from `lucide-react`; class merging with `cn()` from [src/lib/utils.ts](src/lib/utils.ts).

## Style

- TypeScript, 2-space indent, double quotes, semicolons (Prettier enforced — run `npm run format` on files you touch, but avoid reformatting files you didn't change).
- Path alias `@/` → `src/`.
- Match the existing comment style: brief comments only where the code can't speak for itself (see store.ts headers).

## Gotchas

- `npm run lint` reports many pre-existing `prettier/prettier` and `no-explicit-any` findings; a clean lint is not the bar — not introducing *new* errors is.
- The Supabase publishable/anon keys in wrangler configs and the deploy workflow are public by design (they ship in the client bundle); real secrets stay in `.env` / CI secrets.
- Google Sheets mirroring is fire-and-forget: it must never block or fail a user-facing write.
- The Contacts import ([src/lib/contacts.ts](src/lib/contacts.ts)) only works on Android Chrome over HTTPS — always gate UI behind `contactsSupported()`.
- Pushing to `main` deploys to production automatically.
