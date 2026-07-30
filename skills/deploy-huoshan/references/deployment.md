# 部署参考文档

## 服务器信息

| 项目 | 值 |
|------|-----|
| 主机名 | huoshan |
| SSH 别名 | `huoshan` |
| 项目路径 | `/root/data/pindou` |
| 数据路径 | `/root/data/pindou/data/` |
| 服务端口 | 3001（主机 3000 被 new-api 占用时） |
| 管理员后台 | `/admin` |

## SSH 配置

确保 `~/.ssh/config` 中有如下配置：

```
Host huoshan
    HostName <服务器IP>
    User root
```

## 环境变量

所有敏感配置通过 `.env` 文件管理，该文件位于项目根目录且被 `.gitignore` 排除：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ADMIN_USERNAME` | 管理员用户名 | admin |
| `ADMIN_PASSWORD` | 管理员密码 | admin123 |
| `JWT_SECRET` | JWT 签名密钥 | 随机生成（建议固定） |
| `PORT` | 服务端口 | 3000 |

## 常用命令

### 查看容器状态

```bash
ssh huoshan "docker compose -f /root/data/pindou/docker-compose.yml ps"
```

### 查看日志

```bash
ssh huoshan "docker compose -f /root/data/pindou/docker-compose.yml logs -f --tail 50"
```

### 重启服务

```bash
ssh huoshan "cd /root/data/pindou && docker compose restart"
```

### 重新构建并启动

```bash
ssh huoshan "cd /root/data/pindou && docker compose down && docker compose build && docker compose up -d"
```

### 停止服务

```bash
ssh huoshan "cd /root/data/pindou && docker compose down"
```

## 数据管理

### 备份数据库

```bash
ssh huoshan "cp /root/data/pindou/data/pindou.db /root/data/pindou/data/pindou.db.backup-$(date +%Y%m%d)"
```

### 恢复数据库

```bash
ssh huoshan "cp /root/data/pindou/data/pindou.db.backup-20240729 /root/data/pindou/data/pindou.db && docker compose restart"
```

### 重置数据（删除所有授权码和管理员）

```bash
ssh huoshan "rm /root/data/pindou/data/pindou.db && docker compose restart"
```

## 端口管理

服务器上可能存在多个服务，端口冲突时通过修改 `docker-compose.yml` 调整外部映射：

| 服务 | 当前端口 | 备注 |
|------|----------|------|
| pindou | 3001 | 拼豆工坊 |
| new-api | 3000 | 已有的 API 服务 |

修改端口映射后需重建并启动：

```bash
# 修改 docker-compose.yml 中的 ports 映射
sed -i 's/"3000:3000"/"3001:3000"/' docker-compose.yml
# 或恢复
sed -i 's/"3001:3000"/"3000:3000"/' docker-compose.yml

# 重建并启动
docker compose down && docker compose build && docker compose up -d
```

## Docker 镜像加速

在中国服务器上 Docker Hub 访问受限。配置镜像加速器后，构建时间可从 10+ 分钟降至 1-2 分钟。

可用的镜像加速地址：
- `https://docker.m.daocloud.io`（推荐）
- `https://docker.nju.edu.cn`（推荐）
- `https://dockerproxy.com`

## 授权码系统

### API 端点

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/admin/login` | 管理员登录 | 无 |
| POST | `/api/admin/codes` | 创建授权码 | admin JWT |
| GET | `/api/admin/codes` | 授权码列表 | admin JWT |
| POST | `/api/admin/codes/:id/deactivate` | 停用授权码 | admin JWT |
| POST | `/api/auth/verify-code` | 用户验证授权码 | 无 |
| GET | `/api/auth/verify` | 校验 JWT 有效性 | user JWT |

### 授权码类型

| 类型 | 有效期 | 说明 |
|------|--------|------|
| `1day` | 首次使用后 1 天 | 试用码 |
| `7day` | 首次使用后 7 天 | 短期码 |
| `permanent` | 永久 | 长期码 |

### 授权码格式

展示格式：`XXXX-XXXX-XXXX`（12 位字母数字，去掉易混淆字符 `0/O/1/I/8/B`）
