# Bw-inventory

Shop inventory & billing app for a small trading business — track items, purchases, sales, expenses, dealers and customers, generate GST bills as PDFs, and view reports. Multi-user with business-scoped memberships and invites.

Built with **TanStack Start (React 19) + Supabase**, deployed to **Cloudflare Workers**.

**Live:** https://tanstack-start-app.bw-inventory.workers.dev

## Features

- **Dashboard** (`/`) — stock and money summary at a glance.
- **Items** (`/items`, `/items/$id`) — item catalogue with per-item stock history and low-stock levels.
- **Purchases** (`/purchases`) — stock-in entries against dealers.
- **Sales** (`/sales`) — multi-line sales with GST, linked to customers; generates bills.
- **Bills** (`/bills`, `/bills/$id`) — bill list and detail, PDF download/share via jsPDF ([billPdf.ts](src/lib/billPdf.ts)).
- **Expenses** (`/expenses`) — simple expense log.
- **Directory** (`/directory`) — dealers & customers, with import from phone contacts (Contacts Picker API, Android Chrome only — [contacts.ts](src/lib/contacts.ts)).
- **Reports** (`/reports`) — charts via Recharts.
- **Members & invites** (`/members`, `/invite/$token`) — invite users to a business by link; roles enforced by Postgres RLS.
- **Business onboarding/settings** (`/onboarding`, `/business/new`, `/business/settings`) — create/switch businesses; optional Google Sheets backup mirror.
- **Auth** (`/auth`, `/reset-password`) — Supabase email/password auth.
- **Appearance** — light theme with selectable accent colour ([theme.tsx](src/lib/theme.tsx)); fully responsive with dedicated mobile card layouts.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) (file-based routing, SSR, server functions) |
| UI | React 19, Tailwind CSS v4, shadcn/ui (Radix primitives), lucide-react icons, sonner toasts |
| Data | Supabase (Postgres + RLS + Auth), TanStack Query for caching |
| PDF | jsPDF + jspdf-autotable |
| Hosting | Cloudflare Workers (SSR worker + static assets) |
| Tooling | Vite 7, TypeScript, ESLint + Prettier, `@lovable.dev/vite-tanstack-config` |

## Local development

```bash
npm install
npm run dev          # http://localhost:8080
```

Requires **Node 22+** (Vite 7). Environment variables live in `.env` (not committed):

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser Supabase client ([client.ts](src/integrations/supabase/client.ts)) |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | Server-side Supabase client ([client.server.ts](src/integrations/supabase/client.server.ts)) |
| `LOVABLE_API_KEY` / `GOOGLE_SHEETS_API_KEY` | Optional — Google Sheets backup mirror ([sheets.functions.ts](src/lib/sheets.functions.ts)) |

Other scripts:

```bash
npm run build        # production build (client + SSR worker)
npm run preview      # preview the production build
npm run lint         # ESLint
npm run format       # Prettier (writes)
```

## Project structure

```
src/
  routes/                  # File-based routes (TanStack Router)
  routeTree.gen.ts         # GENERATED — do not edit by hand
  components/
    AppLayout.tsx          # Shell: sidebar nav (desktop), bottom nav + FAB (mobile)
    EntityPicker.tsx       # Searchable combobox for items/dealers/customers
    AdminDelete.tsx        # Admin-only delete confirmation
    TweaksPanel.tsx        # Appearance settings (accent colour)
    ui/                    # shadcn/ui primitives + pe.tsx (custom design primitives)
  lib/
    store.ts               # Core data layer: useDB()/setDB() over Supabase, optimistic diffing
    auth.tsx               # AuthProvider (Supabase session)
    business.tsx           # BusinessProvider (active business, memberships)
    billPdf.ts             # GST bill PDF generation
    invites.functions.ts   # Server functions: create/accept invites
    sheets.functions.ts    # Server functions: Google Sheets mirror
    theme.tsx              # Accent colours + theme init script
  integrations/supabase/   # Browser/server clients, auth middleware, generated DB types
  server.ts                # Worker entry: wraps SSR with error capture/page
  start.ts                 # TanStack Start config + global server middleware
supabase/
  migrations/              # SQL migrations (schema + RLS policies)
  config.toml              # Supabase project config
```

### Data model

Postgres tables (all business-scoped, RLS-protected): `businesses`, `business_members`, `business_invites`, `profiles`, `user_roles`, `items`, `dealers`, `customers`, `purchases`, `sales`, `sale_lines`, `expenses`, `app_settings`.

### How data flows

Components read via `useDB()` and write via `setDB(updater)` ([store.ts](src/lib/store.ts)). The store diffs the updater's result against the live snapshot, dispatches the corresponding Supabase mutations, keeps TanStack Query caches in sync, and (if configured) mirrors writes to a per-business Google Sheet as a non-blocking backup.

## Deploy

Every push to `main` auto-deploys via GitHub Actions ([deploy.yml](.github/workflows/deploy.yml)): `npm ci` → `npm run build` → `wrangler deploy -c wrangler.deploy.jsonc`.

Manual deploy:

```bash
npm run build
npx wrangler deploy -c wrangler.deploy.jsonc   # needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
```

Two wrangler configs exist on purpose: `wrangler.jsonc` (dev, entry `src/server.ts`) and `wrangler.deploy.jsonc` (deploy, entry `dist/server/server.js` + built assets).

Database changes go through Supabase migrations in [supabase/migrations/](supabase/migrations/), applied with the Supabase CLI.
