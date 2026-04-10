# y-websocket 无官方 Hub 镜像；与 frontend 的 y-websocket@^1.5.4 对齐，从源码构建。
# 使用 Alpine + apk，避免 deb.debian.org 在部分网络下 502。
# 可选依赖 y-leveldb 需要原生编译：python3、make、g++。
ARG NODE_BASE_IMAGE=node:18-alpine
FROM ${NODE_BASE_IMAGE}
RUN apk add --no-cache git python3 make g++
WORKDIR /app
ARG Y_WEBSOCKET_TAG=v1.5.4
RUN git clone --depth 1 --branch "${Y_WEBSOCKET_TAG}" https://github.com/yjs/y-websocket.git . \
  && npm install
EXPOSE 1234
ENV HOST=0.0.0.0
ENV PORT=1234
CMD ["npm", "start"]
