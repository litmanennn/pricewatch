# syntax=docker/dockerfile:1


# -----------------------------
# Dependencies
# -----------------------------

FROM node:24-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci


# -----------------------------
# Build
# -----------------------------

FROM node:24-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules

COPY . .


# SQLite tarvitsee data-kansion jo
# Next.js buildin aikana, koska API-routejen
# moduulit evaluoidaan buildissä.

RUN mkdir -p /app/data


RUN npm run build


# -----------------------------
# Production
# -----------------------------

FROM node:24-bookworm-slim AS runner

WORKDIR /app


ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

ENV HOSTNAME=0.0.0.0
ENV PORT=3000

ENV DB_FILE_NAME=/app/data/pricewatch.db


RUN groupadd \
      --system \
      --gid 1001 \
      nodejs \
    && useradd \
      --system \
      --uid 1001 \
      --gid nodejs \
      nextjs


COPY --from=builder \
  --chown=nextjs:nodejs \
  /app/public \
  ./public


COPY --from=builder \
  --chown=nextjs:nodejs \
  /app/.next/standalone \
  ./


COPY --from=builder \
  --chown=nextjs:nodejs \
  /app/.next/static \
  ./.next/static


RUN mkdir -p /app/data \
    && chown -R nextjs:nodejs /app/data


USER nextjs


EXPOSE 3000


VOLUME ["/app/data"]


HEALTHCHECK \
  --interval=30s \
  --timeout=10s \
  --start-period=20s \
  --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"


CMD ["node", "server.js"]