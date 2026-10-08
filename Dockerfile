# ============================================================================
# MCR Production Multi-Stage Dockerfile
# ============================================================================

# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# PORT is a default only: managed platforms (Railway, Render, Heroku) inject their
# own PORT at runtime, which takes precedence over this value.
ENV PORT=3000
# Bind the Next.js server to all interfaces so platform edge proxies and container
# health probes can reach it. Never bind to 127.0.0.1 inside a container.
ENV HOSTNAME=0.0.0.0

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy runtime files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/data ./data
COPY --from=builder /app/src/db/schema.sql ./src/db/schema.sql
COPY --from=builder /app/scripts/db-init.mjs ./scripts/db-init.mjs

# Ensure storage directory permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# Probe the runtime PORT (not a hardcoded 3000) so the healthcheck stays accurate
# when a platform injects a different port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["npm", "start"]
