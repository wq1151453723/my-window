# 我的窗口 · 运行镜像（Node 24，Debian 基础，resvg 预编译二进制可用）
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
ENV PORT=4399
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/index.html ./index.html
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/vite.config.ts ./vite.config.ts
RUN mkdir -p /app/data/audio /app/data/images
VOLUME ["/app/data"]
EXPOSE 4399
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4399)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server/index.ts"]