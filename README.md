# Bw-inventory

Shop inventory & billing app — TanStack Start + React + Supabase, deployed to Cloudflare Workers.

## Local development
```bash
npm install
npm run dev          # http://localhost:8080
```
Requires Node 22+ (Vite 7). Supabase keys live in `.env` (not committed).

## Deploy
Every push to `main` auto-deploys to Cloudflare via GitHub Actions
(`.github/workflows/deploy.yml`). Live URL:
**https://tanstack-start-app.bw-inventory.workers.dev**

Manual deploy:
```bash
npm run build
npx wrangler deploy -c wrangler.deploy.jsonc   # needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
```
