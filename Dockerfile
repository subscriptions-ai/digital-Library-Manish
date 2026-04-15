# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install ALL dependencies (including devDependencies for build)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the Vite frontend
RUN npm run build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Global Cache Buster to guarantee new layer mapping on broken Coolify machines
ENV CACHE_BUSTER="2026-04-04T12-25-00-ROOT"
ENV NODE_ENV=production

# Copy package files and install PRODUCTION-only dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built frontend from Stage 1
COPY --from=builder /app/dist ./dist

# Copy the Express server entry point, Prisma schema, generate client, and seeders
COPY server.ts ./
COPY seed-admin.ts ./
COPY prisma/ ./prisma/
RUN npx prisma@6.19.3 generate

# Install tsx globally for running TypeScript in production
RUN npm install -g tsx

# Cache buster to bypass BuildKit mount locks on Coolify
ENV CACHE_BUSTER="2026-04-15T12-33-00"

# Expose the port (default 3000, overridable via PORT env var)
EXPOSE 3000

# Run DB schema sync then start the server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && tsx server.ts"]
