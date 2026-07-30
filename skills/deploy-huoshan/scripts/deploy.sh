#!/usr/bin/env bash
#
# deploy.sh - 拼豆工坊部署到 huoshan 服务器的辅助脚本
# 用法: ./deploy.sh [--port PORT] [--admin-pwd PASSWORD]
#
# 选项:
#   --port PORT         外部映射端口（默认 3001）
#   --admin-pwd PWD     管理员密码（必填）
#   --help              显示帮助
#

set -euo pipefail

HOST="huoshan"
REMOTE_DIR="/root/data/pindou"
PORT="${PORT:-3001}"
ADMIN_PASSWORD=""
JWT_SECRET=""

usage() {
  echo "用法: $0 [--port PORT] --admin-pwd PASSWORD"
  echo ""
  echo "部署拼豆工坊到 huoshan 服务器"
  echo ""
  echo "选项:"
  echo "  --port PORT       外部映射端口（默认 3001）"
  echo "  --admin-pwd PWD   管理员密码（必填）"
  echo "  --help            显示帮助"
  exit 0
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
    --help)
      usage
      ;;
    *)
      echo "未知选项: $1"
      usage
      ;;
  esac
done

if [[ -z "$ADMIN_PASSWORD" ]]; then
  echo "错误: --admin-pwd 参数必填"
  usage
fi

echo "========== 拼豆工坊部署脚本 =========="
echo "目标服务器: $HOST"
echo "远程目录: $REMOTE_DIR"
echo "外部端口: $PORT"
echo ""

# 生成 JWT_SECRET
JWT_SECRET=$(openssl rand -base64 32)

# 第 1 步: 检查 SSH 连接
echo ">>> [1/6] 检查 SSH 连接..."
if ! ssh "$HOST" "echo 'SSH 连接成功'"; then
  echo "错误: 无法连接到 $HOST"
  exit 1
fi

# 第 2 步: 检查 Docker
echo ">>> [2/6] 检查 Docker..."
ssh "$HOST" "docker --version && docker compose version"

# 第 3 步: 同步代码
echo ">>> [3/6] 同步代码..."
ssh "$HOST" "cd $REMOTE_DIR && git stash 2>/dev/null; git pull origin main; git stash drop 2>/dev/null; echo '代码已同步'"

# 第 4 步: 创建 .env 文件
echo ">>> [4/6] 配置环境变量..."
ssh "$HOST" "cat > $REMOTE_DIR/.env << ENVEOF
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD
JWT_SECRET=$JWT_SECRET
ENVEOF"
echo ".env 文件已创建"

# 第 5 步: 构建并启动
echo ">>> [5/6] 构建 Docker 镜像..."
ssh "$HOST" "cd $REMOTE_DIR && docker compose build 2>&1 | tail -5"

echo ">>> [5/6] 启动 Docker 容器..."
ssh "$HOST" "cd $REMOTE_DIR && docker compose up -d"

# 第 6 步: 验证
echo ">>> [6/6] 验证部署..."
sleep 3
HTTP_CODE=$(ssh "$HOST" "curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  echo "✅ 部署成功！服务运行在 http://localhost:$PORT"
  echo "   管理员后台: http://localhost:$PORT/admin"
  echo ""
  echo "管理员账号: admin"
  echo "管理员密码: $ADMIN_PASSWORD"
else
  echo "⚠️  服务返回 HTTP $HTTP_CODE，请检查日志"
  ssh "$HOST" "docker compose -f $REMOTE_DIR/docker-compose.yml logs --tail 20"
fi

echo ""
echo "========== 部署完成 =========="
