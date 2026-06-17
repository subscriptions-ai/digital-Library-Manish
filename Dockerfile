# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine3.19 AS builder

WORKDIR /app

# Copy package files and install ALL dependencies (including devDependencies for build)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Force Stage 1 cache bust
ENV CACHE_BUSTER_STAGE1="2026-06-17T12-40-00"

# Copy source code
COPY . .

# Build the Vite frontend with memory limits to prevent OOM kills on small VPS
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN npm run build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-alpine3.19 AS production

WORKDIR /app

# Global Cache Buster to guarantee new layer mapping on broken Coolify machines
ENV CACHE_BUSTER="2026-06-17T12-40-00-REBUILD"
ENV NODE_ENV=production

# Copy package files and install PRODUCTION-only dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built frontend from Stage 1
COPY --from=builder /app/dist ./dist

# Copy the built Express server, Prisma schema, generated client, and seeders
COPY --from=builder /app/server_compiled.cjs ./
COPY seed-admin.ts ./
COPY prisma/ ./prisma/
COPY public/ ./public/

# Copy the generated Prisma client from builder stage
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Cache buster to bypass BuildKit mount locks on Coolify
ENV CACHE_BUSTER_2="2026-06-17T12-40-00-REDEPLOY"

# Expose the port (default 3000, overridable via PORT env var)
EXPOSE 3000

LABEL deployment.id="2026-05-23T10-59-00-UI"

# Run DB schema sync then start the server using the compiled CJS file
CMD ["npm", "start"]
