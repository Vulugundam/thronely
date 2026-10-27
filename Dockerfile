# Dockerfile for Thronely - Next.js 16 with Prisma + PostgreSQL
# Multi-stage build for minimal production image

# ---- Base stage ----
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies for Prisma, sharp, and native modules (better-sqlite3)
RUN apk add --no-cache openssl libc6-compat python3 make g++

# Build-time DATABASE_URL for Prisma generate / build
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# ---- Dependencies stage ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# ---- Builder stage ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client again (in case schema changed)
COPY prisma ./prisma/
RUN npx prisma generate

# Build the Next.js app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runner stage ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and migrations for runtime
COPY --from=builder /app/prisma ./prisma/

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]