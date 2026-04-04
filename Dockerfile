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

ENV NODE_ENV=production

# Copy package files and install PRODUCTION-only dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built frontend from Stage 1
COPY --from=builder /app/dist ./dist

# Copy the Express server entry point, Prisma schema, and generate client
COPY server.ts ./
COPY prisma/ ./prisma/
RUN npx prisma@6.19.3 generate

# Install tsx globally for running TypeScript in production
RUN npm install -g tsx

# Expose the port (default 3000, overridable via PORT env var)
EXPOSE 3000

# Start the server
CMD ["tsx", "server.ts"]
