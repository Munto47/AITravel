FROM node:18-alpine
WORKDIR /app

RUN npm init -y && npm install y-websocket@^2 ws

# Create a simple server script
RUN cat > server.js << 'SCRIPT'
const http = require('http')
const WebSocket = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils')

const host = process.env.HOST || '0.0.0.0'
const port = parseInt(process.env.PORT || '1234', 10)

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('y-websocket running')
})

const wss = new WebSocket.Server({ server })

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req)
})

server.listen(port, host, () => {
  console.log(`[y-websocket] listening on ${host}:${port}`)
})
SCRIPT

ENV HOST=0.0.0.0
ENV PORT=1234
EXPOSE 1234
CMD ["node", "server.js"]
