# ===========================
# 构建阶段
# ===========================
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm@latest && \
    rm -rf /root/.npm

# 复制工作区配置文件
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY scripts ./scripts
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

# 安装所有依赖（包括开发依赖）并清理
RUN pnpm install --frozen-lockfile && \
    pnpm store prune

# 复制源代码并构建
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# 构建所有包
WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/packages/server
RUN pnpm build && \
    rm -rf node_modules/.cache

# ===========================
# 生产阶段（极简版 - 无 node_modules）
# ===========================
FROM node:20-alpine AS production

# 只安装 PM2、curl 和 pm2-logrotate，并删除不需要的 npm 和 corepack
RUN apk add --no-cache curl && \
    npm install -g pm2 pm2-logrotate --no-scripts && \
    pm2 install pm2-logrotate && \
    pm2 set pm2-logrotate:max_size 100M && \
    pm2 set pm2-logrotate:retain 5 && \
    pm2 set pm2-logrotate:compress true && \
    pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

WORKDIR /app

# 从构建阶段复制 server bundle（shared 已被打包进 index.js，无需单独复制）
COPY --from=builder /app/packages/server/dist ./packages/server/dist
# 复制本地预先构建的 UI 产物到同一目录
COPY packages/ui/dist/. ./packages/server/dist/

# 复制 PM2 配置文件
COPY packages/server/ecosystem.config.cjs /app/

# 创建日志目录
RUN mkdir -p /root/.ccw/logs

# 暴露端口
EXPOSE 3456

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://127.0.0.1:3456/health || exit 1

# 直接启动应用
CMD ["pm2-runtime", "start", "/app/ecosystem.config.cjs"]
