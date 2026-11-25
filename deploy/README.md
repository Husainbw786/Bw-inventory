# Oracle server

Production runs on an Oracle Cloud free ARM server (Ubuntu 24.04, `ubuntu@130.210.41.14`).
The database stays on Supabase.

```
/opt/bw-inventory/
  docker-compose.yml, caddy/Caddyfile   copied from this folder on every deploy
  .env                            secrets + SITE_ADDRESS, created once by hand
  releases/<sha>-<time>/          the last 5 Node builds (.output)
  current -> releases/...         the live one
```

- **app**: `node:22-alpine` running `server/index.mjs` from `current` (read-only).
- **caddy**: HTTPS with automatic Let's Encrypt certificates, compression, and the
  cache headers from `public/_headers` (Caddy doesn't read that file).

## Deploys

Every push to `main` runs [deploy.yml](../.github/workflows/deploy.yml): `BUILD_TARGET=node npm run build`, then
[deploy.sh](deploy.sh) uploads `.output` as a new release, switches `current` and restarts the app.
It needs the repository secret `ORACLE_SSH_KEY` (a private key whose public half is in
`~/.ssh/authorized_keys` on the server).

Manual deploy from a laptop (needs the `VITE_SUPABASE_*` values from deploy.yml in the environment):

```bash
BUILD_TARGET=node npm run build && deploy/deploy.sh ubuntu@130.210.41.14 ~/.ssh/oracle_bwinv_ed25519
```

## Roll back

```bash
ssh ubuntu@130.210.41.14
cd /opt/bw-inventory && ls -t releases          # newest first
ln -sfn releases/<previous> current && docker compose restart app
```

## Server .env

`SITE_ADDRESS` is the domain(s) Caddy serves and gets certificates for, comma-separated
(`bwinventory.husainbw.in, 130-210-41-14.sslip.io`). The rest are read by server code:
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (team invites),
`OPENWA_BASE_URL` + `OPENWA_API_KEY` (WhatsApp), `LOVABLE_API_KEY` + `GOOGLE_SHEETS_API_KEY`
(Sheets backup). After editing it: `docker compose up -d` (Caddy and app pick it up on recreate).

## One-time server setup (already done)

Docker + Compose from Ubuntu's packages, ports 80/443 opened in iptables (saved with
`netfilter-persistent`) and in the subnet's OCI security list.

## Logs

```bash
cd /opt/bw-inventory && docker compose logs -f --tail 100 app
```
