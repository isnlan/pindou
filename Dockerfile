# Debian 13 (trixie) 自带 glibc 2.41，可直接运行 better-sqlite3 的预编译二进制，
# 避免 alpine(musl) 预编译版段错误、源码编译引入额外工具链的问题
FROM node:24-trixie-slim AS build
WORKDIR /app

# npm ci 会触发 better-sqlite3 的 node-gyp rebuild，需要编译工具链（仅构建阶段使用）
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY server ./server
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server/index.js"]
