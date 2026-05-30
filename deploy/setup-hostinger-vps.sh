#!/usr/bin/env bash
set -euo pipefail

APP_DOMAIN="${1:-erp.door.sa}"
APP_DIR="/opt/ghayth-erp"
REPO_URL="https://github.com/barhom64/ghayth-erp.git"
BRANCH="main"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/setup-hostinger-vps.sh ${APP_DOMAIN}"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg git ufw nginx certbot python3-certbot-nginx openssl

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

. /etc/os-release
cat >/etc/apt/sources.list.d/docker.list <<DOCKER_REPO
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable
DOCKER_REPO

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p /var/lib/ghayth/storage /opt/backups/ghayth
chmod 750 /var/lib/ghayth/storage /opt/backups/ghayth

if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
else
  git -C "${APP_DIR}" fetch origin "${BRANCH}"
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
fi

cd "${APP_DIR}"

if [[ ! -f .env ]]; then
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 32)"
  FIELD_ENCRYPTION_KEY="$(openssl rand -hex 32)"
  SECRETS_ENCRYPTION_KEY="$(openssl rand -hex 32)"
  ADMIN_PASSWORD="Ghaith-$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9@#%+=' | head -c 18)!1"

  cat > .env <<ENV_FILE
APP_DOMAIN=${APP_DOMAIN}
CORS_ORIGINS=https://${APP_DOMAIN}
POSTGRES_DB=ghayth_erp
POSTGRES_USER=ghayth
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY}
SECRETS_ENCRYPTION_KEY=${SECRETS_ENCRYPTION_KEY}
NODE_ENV=production
LOG_LEVEL=info
PERSIST_ALL_EVENTS=true
ADMIN_EMAIL=admin@door.sa
ADMIN_PASSWORD=${ADMIN_PASSWORD}
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/var/lib/ghayth/storage
REDIS_URL=redis://redis:6379
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@door.sa
AI_INTEGRATIONS_ANTHROPIC_API_KEY=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_ID=
SEED_DEMO_DATA=false
ENV_FILE

  chmod 600 .env
  echo "Created .env. Save the generated admin password from: ${APP_DIR}/.env"
else
  echo ".env already exists. Keeping existing secrets."
fi

cat >/etc/nginx/sites-available/ghayth-erp <<NGINX
server {
  listen 80;
  server_name ${APP_DOMAIN};

  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:8088;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
NGINX

ln -sf /etc/nginx/sites-available/ghayth-erp /etc/nginx/sites-enabled/ghayth-erp
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

docker compose -f docker-compose.prod.yml up -d --build

certbot --nginx -d "${APP_DOMAIN}" --non-interactive --agree-tos -m admin@door.sa --redirect || true
systemctl reload nginx

echo "Ghayth ERP deployment command completed for https://${APP_DOMAIN}"
echo "Check status: cd ${APP_DIR} && docker compose -f docker-compose.prod.yml ps"
