#!/usr/bin/env bash
# Triển khai / cập nhật ReUse Campus trên VPS Ubuntu.
# Chạy được nhiều lần: lần đầu sẽ cài đặt, các lần sau sẽ cập nhật code mới nhất.
#   curl -fsSL https://raw.githubusercontent.com/luongminhkhanh/reuse-campus/main/deploy.sh -o deploy.sh && bash deploy.sh
set -euo pipefail

REPO="https://github.com/luongminhkhanh/reuse-campus.git"
APP_NAME="reuse-campus"
APP_DIR="$HOME/reuse-campus"
DOMAIN="${DOMAIN:-sv27.bcse-vju.com}"
PORT="${PORT:-3000}"
SECRET_FILE="$HOME/.reuse-campus-secret"

if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi
step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

step "1/6 Cài gói hệ thống (git, nginx, curl)"
$SUDO apt-get update -y
$SUDO apt-get install -y git nginx curl ca-certificates openssl

step "2/6 Cài Node.js 22"
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]'); fi
if [ "$NODE_MAJOR" -lt 22 ]; then
  if [ -n "$SUDO" ]; then curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  else curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; fi
  $SUDO apt-get install -y nodejs
fi
echo "Node $(node -v), npm $(npm -v)"
if ! command -v pm2 >/dev/null 2>&1; then $SUDO npm install -g pm2; fi

step "3/6 Tải code mới nhất"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
npm ci --omit=dev

step "4/6 Chạy app bằng PM2 (cổng $PORT)"
# Giữ cố định khoá phiên đăng nhập giữa các lần khởi động lại
[ -f "$SECRET_FILE" ] || { openssl rand -hex 32 > "$SECRET_FILE"; chmod 600 "$SECRET_FILE"; }
export SESSION_SECRET="$(cat "$SECRET_FILE")" PORT NODE_ENV=production
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start server.js --name "$APP_NAME"
fi
pm2 save
# Tự chạy lại app khi VPS khởi động lại
$SUDO env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$(id -un)" --hp "$HOME" >/dev/null

step "5/6 Cấu hình nginx cho $DOMAIN"
$SUDO tee /etc/nginx/sites-available/$APP_NAME >/dev/null <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $DOMAIN _;
    client_max_body_size 5M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
$SUDO rm -f /etc/nginx/sites-enabled/default
$SUDO ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/$APP_NAME
$SUDO nginx -t
$SUDO systemctl enable --now nginx
$SUDO systemctl reload nginx

step "6/6 Kiểm tra"
ok=0
for i in $(seq 1 20); do
  if curl -fs "http://127.0.0.1:$PORT/api/meta" >/dev/null; then ok=1; break; fi
  sleep 0.5
done
if [ "$ok" -eq 1 ] && curl -fs -o /dev/null http://127.0.0.1/; then
  printf '\n\033[1;32m✔ Xong! App chạy ở cổng %s, nginx đã chuyển cổng 80 vào app.\033[0m\n' "$PORT"
  echo "  Mở thử: https://$DOMAIN"
  echo "  Xem log: pm2 logs $APP_NAME   |   Cập nhật code: bash $APP_DIR/deploy.sh"
else
  printf '\n\033[1;31m✘ App chưa phản hồi. Log gần nhất:\033[0m\n'
  pm2 logs "$APP_NAME" --lines 30 --nostream || true
  exit 1
fi
