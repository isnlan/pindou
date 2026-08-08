---
name: deploy-huoshan
description: 部署拼豆工坊到 huoshan 火山引擎服务器，并验证代码、容器、HTTP 服务和静态资源一致性。用于用户要求部署到服务器、上线代码，或替换群二维码等静态资源并发布时；支持将外部文件移动进项目、更新引用、提交推送、保留生产环境密钥以及用 SHA-256 验证线上文件。
---

# Deploy to Huoshan

## 固定上下文

- SSH 主机：`huoshan`
- 远端仓库：`/root/data/pindou`
- 服务端口：`3001`
- 部署分支：`main`
- 服务器 Git 远端：`origin`
- 本地推送远端：先用 `git remote -v` 确认，不要假定名称

详细服务器信息和故障排查见 [references/deployment.md](references/deployment.md)。

## 标准流程

1. 检查本地工作区、Git 远端、目标分支、SSH 和 Docker：

   ```bash
   git status --short
   git remote -v
   ssh huoshan "docker --version && docker compose version"
   ```

2. 实现变更并运行 `npm run build`。只提交本次任务涉及的文件。

3. 提交并推送 `main`。部署依赖服务器执行 `git pull`，因此未推送的本地文件不会进入镜像。

4. 在服务器使用快进拉取并重建：

   ```bash
   ssh huoshan "set -e; cd /root/data/pindou; git pull --ff-only origin main; docker compose build; docker compose up -d; docker compose ps"
   ```

5. 验证容器、日志和首页：

   ```bash
   ssh huoshan "cd /root/data/pindou && docker compose ps && docker compose logs --tail 20"
   ssh huoshan "curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3001/"
   ```

也可运行 `scripts/deploy.sh`。默认保留远端 `.env`；仅在用户明确要求轮换凭据并提供密码时使用 `--admin-pwd`。

## 静态资源更新

当用户要求把外部图片“移动到项目”并部署时：

1. 查找当前资源引用，确认目标路径和 MIME 类型。不要把 PNG 内容放进 `.jpg` 文件名。
2. 将文件放入 `public/`，同步更新代码引用。先比较源文件与项目文件的 SHA-256。
3. 在确认项目文件存在、哈希一致且构建通过后，删除原路径文件；这才满足“移动”，并在最终结果中明确说明原文件已删除。
4. 提交、推送并重建服务器容器。
5. 从服务器本机下载资源，验证状态码、`Content-Type` 和 SHA-256：

   ```bash
   local_hash=$(shasum -a 256 public/wxcode.png | awk '{print $1}')
   remote_hash=$(ssh huoshan "curl -fsS http://localhost:3001/wxcode.png | sha256sum | cut -d' ' -f1")
   test "$local_hash" = "$remote_hash"
   ssh huoshan "curl -fsSI http://localhost:3001/wxcode.png | grep -i '^Content-Type:'"
   ```

   或使用：

   ```bash
   skills/deploy-huoshan/scripts/deploy.sh --verify-asset public/wxcode.png
   ```

## 生产配置保护

- 将远端 `.env` 视为生产数据。普通代码或资源部署不得覆盖它。
- 远端 `.env` 未被 Git 跟踪是正常状态，不要为清理工作区而删除或 stash 它。
- 不要自动 stash/drop 服务器上的修改。若存在被跟踪文件修改，停止部署并报告冲突。
- 只有用户明确要求轮换管理员凭据时，才生成新 `JWT_SECRET` 并重写 `.env`。

## 域名验证边界

`https://pindou.javai.cn` 当前由 EdgeOne Pages 提供，不等同于 `huoshan:3001`。服务器部署成功的判据是服务器本机 `localhost:3001` 的容器和 HTTP 校验通过。

仍需检查公网域名，但若响应头显示 `Server: edgeone-pages`，或资源路径返回 SPA 的 `text/html`，应明确报告：服务器版本已更新，EdgeOne Pages 尚未发布该提交。不要把公网旧版本误判为服务器部署失败，也不要声称域名已更新。
