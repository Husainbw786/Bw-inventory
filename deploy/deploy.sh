#!/usr/bin/env bash
# Ships a finished Node build (.output) to the Oracle server and switches to it.
#
#   BUILD_TARGET=node npm run build
#   deploy/deploy.sh ubuntu@130.210.41.14 [ssh-key-file]
#
# Each deploy goes to its own releases/<id> folder and `current` is switched to
# it, so a bad deploy can be undone by pointing `current` back (see README.md).
set -euo pipefail

TARGET="${1:?usage: deploy/deploy.sh user@host [ssh-key-file]}"
KEY="${2:-}"
DIR=/opt/bw-inventory
ID="$(git rev-parse --short HEAD 2>/dev/null || date +%s)-$(date +%Y%m%d%H%M%S)"
SSH=(ssh -o StrictHostKeyChecking=accept-new ${KEY:+-i "$KEY"})

test -f .output/server/index.mjs || { echo "No Node build found: run BUILD_TARGET=node npm run build first" >&2; exit 1; }
test -f .output/nitro.json && grep -q '"node-server"' .output/nitro.json || { echo ".output is not a node-server build" >&2; exit 1; }

echo "→ uploading release $ID"
tar -C .output -czf - . | "${SSH[@]}" "$TARGET" "mkdir -p $DIR/releases/$ID && tar -C $DIR/releases/$ID -xzf -"
tar -C deploy -czf - docker-compose.yml Caddyfile | "${SSH[@]}" "$TARGET" "mkdir -p $DIR/caddy && tar -C $DIR -xzf - && mv -f $DIR/Caddyfile $DIR/caddy/Caddyfile"

echo "→ switching and restarting"
"${SSH[@]}" "$TARGET" bash -s -- "$DIR" "$ID" <<'REMOTE'
set -euo pipefail
DIR="$1"; ID="$2"
cd "$DIR"
test -f .env || { echo "$DIR/.env is missing (see deploy/README.md)" >&2; exit 1; }
ln -sfn "releases/$ID" current.new && mv -T current.new current
docker compose up -d --remove-orphans
docker compose restart app
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || docker compose restart caddy
# Wait for the app to answer, then keep the 5 newest releases.
for i in $(seq 1 30); do
  if docker compose exec -T app wget -q -O /dev/null http://127.0.0.1:3000/privacy 2>/dev/null; then ok=1; break; fi
  sleep 1
done
[ "${ok:-}" = 1 ] || { echo "App did not start; logs:" >&2; docker compose logs --tail 40 app >&2; exit 1; }
ls -1t releases | tail -n +6 | xargs -r -I{} rm -rf "releases/{}"
echo "live: release $ID"
REMOTE
