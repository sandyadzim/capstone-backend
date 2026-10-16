# syntax=docker/dockerfile:1

# base: toolchain (Node 24 + Bun 1.4.2)
FROM node:24-bookworm-slim AS base
ENV BUN_INSTALL=/usr/local \
  PATH=/usr/local/bin:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates unzip \
  && curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2" \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# builder: full deps + source (image ini juga dipakai untuk migrate & seed)
FROM base AS builder
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# runtime: production deps only
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 3010
CMD ["node", "dist/main"]