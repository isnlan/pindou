---
name: deploy-huoshan
description: 部署拼豆工坊到火山引擎云服务器（huoshan）的完整工作流。包括通过 SSH 连接服务器、初始化环境、配置 Docker 镜像加速、构建和启动 Docker 容器、验证服务可用的全流程。当用户请求部署到 huoshan、部署到服务器、或需要将项目上线到云端时触发。
---

# Deploy to Huoshan

## 前置条件

- `huoshan` 主机已在本地 SSH config 中配置（`~/.ssh/config`），可通过 `ssh huoshan` 直连
- 服务器已安装 Docker
- 本地项目代码已提交至 GitHub
- `.env` 中的 `ADMIN_PASSWORD` 和 `JWT_SECRET` 每次部署都应更新

## 部署流程

### 第 1 步：SSH 连接检查

验证服务器可达且 Docker 可用：

```bash
ssh huoshan "docker --version && docker compose version"
```

### 第 2 步：同步代码

在服务器上拉取最新代码：

```bash
ssh huoshan "cd /root/data/pindou && git pull origin main"
```

如果工作区有未提交的本地修改（如端口配置），先 stash 再 pull：

```bash
ssh huoshan "cd /root/data/pindou && git stash && git pull origin main && git stash drop"
```

### 第 3 步：配置环境变量

创建或更新 `.env` 文件（⚠️ 密钥从不上传到 Git）：

```bash
ssh huoshan "cat > /root/data/pindou/.env << 'ENV_EOF'
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<自定义强密码>
JWT_SECRET=<openssl rand -base64 32>
ENV_EOF"
```

`JWT_SECRET` 建议用 `openssl rand -base64 32` 生成。

### 第 4 步：配置 Docker 镜像加速（中国服务器必需）

如果服务器在中国大陆，Docker Hub 访问可能极慢。配置 daemon.json
写入 `/etc/docker/daemon.json`（用 Python 确保 JSON 格式正确）：

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.nju.edu.cn"
  ]
}
```

然后用 Python 写入确保格式正确：

```bash
ssh huoshan "python3 -c \"
import json
with open('/etc/docker/daemon.json', 'w') as f:
    json.dump({'registry-mirrors': ['https://docker.m.daocloud.io', 'https://docker.nju.edu.cn']}, f)
\""
```

然后重启 Docker 并验证：

```bash
ssh huoshan "systemctl restart docker && sleep 3 && docker info 2>&1 | grep -A5 'Registry Mirrors'"
```

### 第 5 步：构建并启动 Docker 容器

```bash
ssh huoshan "cd /root/data/pindou && docker compose build 2>&1 | tail -10"
ssh huoshan "cd /root/data/pindou && docker compose up -d"
```

### 第 6 步：验证服务

检查容器是否正常运行：

```bash
ssh huoshan "docker compose -f /root/data/pindou/docker-compose.yml ps"
ssh huoshan "docker compose -f /root/data/pindou/docker-compose.yml logs | tail -10"
```

验证 HTTP 服务：

```bash
ssh huoshan "curl -s -o /dev/null -w '%%{http_code}' http://localhost:<PORT>/api/auth/verify"
ssh huoshan "curl -s http://localhost:<PORT>/admin | head -3"
```

验证管理员登录：

```bash
TOKEN=$(ssh huoshan "curl -s -X POST http://localhost:<PORT>/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{\"username\":\"admin\",\"password\":\"<ADMIN_PASSWORD>\"}' | python3 -c \"import sys,json; print(json.load(sys.stdin)['token'])\"")
echo "Token: ${TOKEN:0:20}..."
```

### 第 7 步：验证授权码流程

创建并验证授权码（使用第 6 步获取到的 TOKEN）：

```bash
ssh huoshan "curl -s -X POST http://localhost:<PORT>/api/admin/codes \
  -H \"Authorization: Bearer <TOKEN>\" \
  -H 'Content-Type: application/json' \
  -d '{\"type\":\"7day\",\"note\":\"deploy-verify\"}' | python3 -c \"import sys,json; c=json.load(sys.stdin); print(c['displayCode'])\""
```

## 常见问题

### 端口冲突

如果服务器上已有其他服务占用端口 3000（如 `new-api`），修改 `docker-compose.yml` 中的端口映射：

```bash
sed -i 's/"3000:3000"/"3001:3000"/' docker-compose.yml
```

### Docker 构建超慢

按第 4 步配置镜像加速器后，构建速度可从 10+ 分钟降至 1-2 分钟。

### 数据持久化

SQLite 数据库文件保存在 `/root/data/pindou/data/pindou.db`，通过 Docker volume 映射确保容器重启后数据不丢失。如果需要重置数据，删掉该文件后重启容器。

## 参考资源

完整的部署参考和常见问题排查可查看 `references/deployment.md`。
