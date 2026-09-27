#!/bin/bash
# Crackers Hyderabad — safe update on an already-deployed KVM.
# Usage: sudo bash /root/crackers-deploy/update.sh
#   (or: sudo bash deploy/kvm/update.sh from the repo checkout on the server)
#
# Pulls latest source -> installs deps -> rebuilds frontend -> restarts API ->
# reloads Nginx if the site config changed -> health check.
# NEVER touches: $DEPLOY_DIR/.env, /var/www/crackershyderabad-media, Firestore data.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/root/crackers-deploy}"
APP_DIR="${APP_DIR:-/var/www/crackershyderabad}"
SRC_DIR="${SRC_DIR:-$DEPLOY_DIR/repo}"

if [ ! -d "$SRC_DIR/.git" ]; then
  echo "ERROR: no git checkout at $SRC_DIR."
  echo "Clone once: git clone <repo-url> $SRC_DIR"
  exit 1
fi

echo "==> 1/6 Update source"
cd "$SRC_DIR"
git pull --ff-only
echo "    $(git log --oneline -1)"

echo "==> 2/6 Install dependencies"
cd "$SRC_DIR/api" && npm ci --omit=dev --no-audit --no-fund
cd "$SRC_DIR/client" && npm ci --no-audit --no-fund

echo "==> 3/6 Build frontend"
npm run build
test -f dist/index.html || { echo "ERROR: build produced no dist/index.html"; exit 1; }

echo "==> 4/6 Publish build (atomic swap, uploads untouched)"
rm -rf "${APP_DIR}.new" && mkdir -p "${APP_DIR}.new"
cp -a "$SRC_DIR/client/dist/." "${APP_DIR}.new/"
rm -rf "${APP_DIR}.old" || true
mv "$APP_DIR" "${APP_DIR}.old"
mv "${APP_DIR}.new" "$APP_DIR"
chown -R www-data:www-data "$APP_DIR" || true
rm -rf "$DEPLOY_DIR/api" && cp -a "$SRC_DIR/api" "$DEPLOY_DIR/api"
ln -sfn "$DEPLOY_DIR/.env" "$DEPLOY_DIR/api/.env" 2>/dev/null || cp "$DEPLOY_DIR/.env" "$DEPLOY_DIR/api/.env"

echo "==> 5/6 Restart backend + reload Nginx if site config changed"
cd "$DEPLOY_DIR"
if [ -f ecosystem.config.cjs ]; then
  pm2 startOrRestart ecosystem.config.cjs --env production
else
  pm2 restart crackers-api || PORT=3001 NODE_ENV=production pm2 start "$DEPLOY_DIR/api/server.js" --name crackers-api
fi
if ! cmp -s "$SRC_DIR/deploy/nginx/crackershyderabad.conf" /etc/nginx/sites-available/crackershyderabad 2>/dev/null; then
  echo "    Nginx site config differs — review manually, NOT auto-overwritten (domain is baked in)."
  echo "    Diff: diff $SRC_DIR/deploy/nginx/crackershyderabad.conf /etc/nginx/sites-available/crackershyderabad"
else
  echo "    Nginx config unchanged."
fi

echo "==> 6/6 Health check"
sleep 3
curl -fsS "http://127.0.0.1:3001/api/health" | grep -q '"status":"ok"' \
  && echo "    API health: OK" \
  || { echo "ERROR: API health check failed"; pm2 logs crackers-api --lines 30 --nostream || true; exit 1; }

echo ""
echo "UPDATE DONE. Verify https://$(hostname -f)/ in a browser."
