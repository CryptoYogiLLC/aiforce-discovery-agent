# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files
COPY --from=builder /app/dist ./dist

# Copy migrations for auto-apply on startup
COPY migrations/ ./migrations/

# Use existing node user (uid 1000) for security
RUN chown -R node:node /app

USER node

# Environment variables
ENV NODE_ENV=production \
    PORT=3001

# Health check (use 127.0.0.1 to avoid IPv6 resolution issues)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3001/health || exit 1

EXPOSE 3001

CMD ["node", "dist/index.js"]
