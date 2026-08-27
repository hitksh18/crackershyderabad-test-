#!/bin/bash
set -e
T=/root/deploy-incoming
rm -rf $T && mkdir -p $T
tar -xzf /root/deploy-latest.tar.gz --no-same-permissions -C $T
find $T -type d -exec chmod 755 {} +
find $T -type f -exec chmod 644 {} +
rm -rf /var/www/crackershyderabad.old
mv /var/www/crackershyderabad /var/www/crackershyderabad.old
mv $T/dist /var/www/crackershyderabad
chown -R www-data:www-data /var/www/crackershyderabad
if [ -d "$T/api" ]; then
  cp -a $T/api/. /root/crackers-deploy/api/
  cd /root/crackers-deploy/api && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 || true
  pm2 restart crackers-api >/dev/null || true
fi
rm -rf $T /root/deploy-latest.tar.gz
echo DEPLOY-DONE