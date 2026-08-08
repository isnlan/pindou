#!/usr/bin/env bash

set -euo pipefail

HOST="huoshan"
REMOTE_DIR="/root/data/pindou"
PORT="${PORT:-3001}"
ADMIN_PASSWORD=""
VERIFY_ASSET=""

usage() {
  cat <<'EOF'
用法: deploy.sh [--port PORT] [--admin-pwd PASSWORD] [--verify-asset PROJECT_PATH]

默认保留服务器现有 .env。提供 --admin-pwd 时才轮换管理员密码和 JWT_SECRET。

选项:
  --port PORT                  外部映射端口（默认 3001）
  --admin-pwd PASSWORD         轮换管理员密码和 JWT_SECRET
  --verify-asset PROJECT_PATH  验证静态资源，如 public/wxcode.png
  --help                       显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --admin-pwd)
      ADMIN_PASSWORD="$2"
      shift 2
      ;;
    --verify-asset)
      VERIFY_ASSET="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "未知选项: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "$VERIFY_ASSET" ]]; then
  if [[ "$VERIFY_ASSET" != public/* || ! -f "$VERIFY_ASSET" ]]; then
    echo "错误: --verify-asset 必须是存在的 public/ 目录文件" >&2
    exit 2
  fi
fi

echo ">>> 检查 SSH 和 Docker"
ssh "$HOST" "docker --version && docker compose version"

echo ">>> 检查远端工作区并拉取代码"
ssh "$HOST" "set -e
cd '$REMOTE_DIR'
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo '错误: 远端存在被跟踪文件修改，已停止部署' >&2
  git status --short >&2
  exit 1
fi
git pull --ff-only origin main"

if [[ -n "$ADMIN_PASSWORD" ]]; then
  echo ">>> 轮换生产凭据"
  JWT_SECRET=$(openssl rand -base64 32)
  printf 'ADMIN_USERNAME=admin\nADMIN_PASSWORD=%s\nJWT_SECRET=%s\n' \
    "$ADMIN_PASSWORD" "$JWT_SECRET" | ssh "$HOST" "umask 077; cat > '$REMOTE_DIR/.env'"
else
  echo ">>> 保留服务器现有 .env"
  ssh "$HOST" "test -s '$REMOTE_DIR/.env'"
fi

echo ">>> 构建并启动容器"
ssh "$HOST" "set -e; cd '$REMOTE_DIR'; docker compose build; docker compose up -d; docker compose ps"

echo ">>> 验证首页和日志"
HTTP_CODE=$(ssh "$HOST" "curl -sS -o /dev/null -w '%{http_code}' 'http://localhost:$PORT/'")
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "错误: 首页返回 HTTP $HTTP_CODE" >&2
  ssh "$HOST" "cd '$REMOTE_DIR' && docker compose logs --tail 20" >&2
  exit 1
fi

if [[ -n "$VERIFY_ASSET" ]]; then
  ASSET_URL="/${VERIFY_ASSET#public/}"
  LOCAL_HASH=$(shasum -a 256 "$VERIFY_ASSET" | awk '{print $1}')
  REMOTE_HASH=$(ssh "$HOST" "curl -fsS 'http://localhost:$PORT$ASSET_URL' | sha256sum | cut -d' ' -f1")
  CONTENT_TYPE=$(ssh "$HOST" "curl -fsSI 'http://localhost:$PORT$ASSET_URL' | tr -d '\r' | awk -F': ' 'tolower(\$1) == \"content-type\" {print \$2}'")
  if [[ "$LOCAL_HASH" != "$REMOTE_HASH" ]]; then
    echo "错误: 静态资源哈希不一致" >&2
    exit 1
  fi
  echo "静态资源: $ASSET_URL"
  echo "SHA-256: $REMOTE_HASH"
  echo "Content-Type: $CONTENT_TYPE"
fi

echo "部署成功: http://localhost:$PORT"
