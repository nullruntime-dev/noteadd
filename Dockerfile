# syntax=docker/dockerfile:1.7

ARG BASE_IMAGE=docker-hub.local.l2c-lab.dev/base/node-24.16-ap:latest

# ---- Stage 1: build the Vite client + install all deps for build ----
FROM ${BASE_IMAGE} AS builder
WORKDIR /app

# Install all deps (including devDependencies) for the build
COPY package*.json ./
RUN npm ci

# Build the client (tsc -b && vite build -> dist/)
COPY tsconfig*.json ./
COPY index.html vite.config.ts ./
COPY src/ ./src/
COPY server/ ./server/
COPY public/ ./public/
RUN npm run build

# ---- Stage 2: runtime — single container serving client + API ----
FROM ${BASE_IMAGE} AS runtime
WORKDIR /app

# git is required by simple-git for push/pull operations at runtime
RUN apk add --no-cache git

# Install only production deps (no devDependencies) + tsx to run TS server
COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx@4.23.1

# Bring the built client + server source
COPY --from=builder /app/dist ./dist
COPY server/ ./server/
COPY tsconfig*.json ./

# Persistent volumes: the cloned git repo and the noteadd note volume
# (server-backed vault where all notes are written as .md files)
VOLUME ["/app/.notepadd-repo", "/app/.notepadd-volume"]

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# tsx runs the TS server directly (no separate compile step needed)
CMD ["node_modules/.bin/tsx", "server/index.ts"]