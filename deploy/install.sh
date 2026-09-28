#!/usr/bin/env bash
# Installation SpeedPost sur Debian/Ubuntu : sudo bash deploy/install.sh speedpost.mondomaine.fr
set -euo pipefail
DOMAIN="${1:?Usage : sudo bash deploy/install.sh <sous-domaine>}"
[ "$(id -u)" -eq 0 ] || { echo "Lancez ce script avec sudo"; exit 1; }
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
fi
apt-get install -y nginx certbot python3-certbot-nginx build-essential
id speedpost >/dev/null 2>&1 || useradd --system --home /opt/speedpost --shell /usr/sbin/nologin speedpost
mkdir -p /opt/speedpost /var/lib/speedpost
cp -r src public package.json /opt/speedpost/
cd /opt/speedpost && npm install --omit=dev --no-audit --no-fund
if [ ! -f .env ]; then
  cp "$OLDPWD/.env.example" .env
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|" .env
  echo "SECRET=$(openssl rand -hex 32)" >> .env
fi
chown -R speedpost:speedpost /opt/speedpost /var/lib/speedpost && chmod 600 .env
cp "$OLDPWD/deploy/speedpost.service" /etc/systemd/system/speedpost.service
sed "s|speedpost.mondomaine.fr|$DOMAIN|" "$OLDPWD/deploy/nginx.conf" > /etc/nginx/sites-available/speedpost
ln -sf /etc/nginx/sites-available/speedpost /etc/nginx/sites-enabled/speedpost
systemctl daemon-reload && systemctl enable --now speedpost
nginx -t && systemctl reload nginx
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || echo "⚠️ Certificat non obtenu : vérifiez que $DOMAIN pointe vers ce serveur, puis : sudo certbot --nginx -d $DOMAIN"
echo "✅ SpeedPost en ligne : https://$DOMAIN"
