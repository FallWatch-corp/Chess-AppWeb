FROM node:24-alpine AS dependances
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace=client

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
COPY --from=dependances /app/node_modules ./node_modules
COPY client ./client
RUN npm run build --workspace=client

FROM node:24-alpine AS dependances-prod
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace=client --omit=dev

FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY --from=dependances-prod /app/node_modules ./node_modules
COPY --from=build /app/client/build ./client/build
COPY client/package.json ./client/package.json

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=client"]
