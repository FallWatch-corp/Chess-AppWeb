FROM node:24-alpine AS dependances
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace=server --omit=dev

FROM node:24-alpine
WORKDIR /app
COPY --from=dependances /app/node_modules ./node_modules
COPY server ./server

ENV DATABASE_PATH=/data/chess-app.db
EXPOSE 3000

CMD ["node", "server/server.js"]
