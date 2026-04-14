# 生产镜像：构建期注入 NEXT_PUBLIC_*（Railway / CI 通过 --build-arg 传入）
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_Y_WEBSOCKET_URL
ARG NEXT_PUBLIC_AMAP_JS_KEY
ARG NEXT_PUBLIC_AMAP_SECURITY_CODE

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_Y_WEBSOCKET_URL=$NEXT_PUBLIC_Y_WEBSOCKET_URL
ENV NEXT_PUBLIC_AMAP_JS_KEY=$NEXT_PUBLIC_AMAP_JS_KEY
ENV NEXT_PUBLIC_AMAP_SECURITY_CODE=$NEXT_PUBLIC_AMAP_SECURITY_CODE

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
