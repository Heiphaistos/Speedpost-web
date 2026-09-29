#!/usr/bin/env bash
# Installation / mise à jour de SpeedPost sur Debian/Ubuntu (relançable sans risque) :
#   sudo bash deploy/install.sh speedpost.mondomaine.fr [mot_de_passe_d_envoi]
# Le mot de passe d'envoi est facultatif (vide = inchangé ; « - » le retire = envoi ouvert à tous).
set -euo pipefail
DOMAIN="${1:?Usage : sudo bash deploy/install.sh <sous-domaine> [mot_de_passe_d_envoi]}"
UPLOAD_PW="${2:-}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/speedpost
DATA=/var/lib/speedpost
[ "$(id -u)" -eq 0 ] || { echo "Lancez ce script en root (sudo)"; exit 1; }
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Nom de domaine invalide : $DOMAIN"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> Dépendances système"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
fi
NEED=""
for p in nginx certbot python3-certbot-nginx build-essential curl openssl; do dpkg -s "$p" >/dev/null 2>&1 || NEED="$NEED $p"; done
if [ -n "$NEED" ]; then apt-get update -qq && apt-get install -y $NEED; fi

echo "==> Application"
id speedpost >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin speedpost
mkdir -p "$APP" "$DATA/downloads"
rm -rf "$APP/src" "$APP/public"
cp -r "$SRC/src" "$SRC/public" "$SRC/package.json" "$APP/"
cd "$APP" && npm install --omit=dev --no-audit --no-fund

echo "==> Configuration ($APP/.env)"
if [ ! -f .env ]; then
  cp "$SRC/.env.example" .env
  sed -i "s|^DATA_DIR=.*|DATA_DIR=$DATA|" .env
  echo "SECRET=$(openssl rand -hex 32)" >> .env
fi
sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|" .env
if [ "$UPLOAD_PW" = "-" ]; then
  sed -i "s|^UPLOAD_PASSWORD=.*|UPLOAD_PASSWORD=|" .env
elif [ -n "$UPLOAD_PW" ]; then
  [[ "$UPLOAD_PW" =~ ^[^|\\\&]+$ ]] || { echo "Mot de passe d'envoi : caractères | \\ & interdits"; exit 1; }
  sed -i "s|^UPLOAD_PASSWORD=.*|UPLOAD_PASSWORD=$UPLOAD_PW|" .env
fi
chown -R speedpost:speedpost "$APP" "$DATA" && chmod 600 .env

echo "==> Service systemd"
cp "$SRC/deploy/speedpost.service" /etc/systemd/system/speedpost.service
systemctl daemon-reload
systemctl enable speedpost >/dev/null
systemctl restart speedpost

echo "==> nginx + HTTPS"
if [ ! -f /etc/nginx/sites-available/speedpost ] || ! grep -q "server_name $DOMAIN;" /etc/nginx/sites-available/speedpost; then
  sed "s|speedpost.mondomaine.fr|$DOMAIN|" "$SRC/deploy/nginx.conf" > /etc/nginx/sites-available/speedpost
fi
ln -sf /etc/nginx/sites-available/speedpost /etc/nginx/sites-enabled/speedpost
nginx -t && systemctl reload nginx
if ! grep -q "ssl_certificate" /etc/nginx/sites-available/speedpost; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect \
    || echo "⚠️ Certificat non obtenu : vérifiez que $DOMAIN pointe vers ce serveur, puis : sudo certbot --nginx -d $DOMAIN"
fi

echo "==> Vérification"
for _ in $(seq 1 15); do curl -fsS http://127.0.0.1:3080/health >/dev/null 2>&1 && break; sleep 1; done
if curl -fsS http://127.0.0.1:3080/health >/dev/null; then echo "✅ SpeedPost en ligne : https://$DOMAIN"
else echo "❌ Le service ne répond pas : journalctl -u speedpost -n 50"; exit 1; fi
