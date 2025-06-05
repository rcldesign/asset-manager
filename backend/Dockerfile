# Backend Dockerfile for development and production
FROM node:20-alpine AS base

# Install system dependencies for embedded mode and runtime
RUN apk add --no-cache \
    postgresql15 \
    postgresql15-contrib \
    redis \
    supervisor \
    curl \
    dumb-init \
    tini

# Create app directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY prisma ./prisma/

# Dependencies stage - separate for better caching
FROM base AS deps
RUN npm ci --only=production && npm cache clean --force

# Development dependencies stage
FROM base AS dev-deps
RUN npm ci

# Build stage
FROM dev-deps AS builder
COPY . .
RUN npm run prisma:generate
RUN npm run build
RUN npm prune --production

# Production stage
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001

# Create non-root user with proper permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy built application and production dependencies
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Create directories and set permissions
RUN mkdir -p \
    /var/lib/postgresql/data \
    /var/lib/redis \
    /var/log/supervisor \
    /app/uploads \
    /app/logs && \
    chown -R postgres:postgres /var/lib/postgresql && \
    chown -R redis:redis /var/lib/redis && \
    chown -R nodejs:nodejs /app/uploads /app/logs

# Copy configuration files
COPY --chown=nodejs:nodejs supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY --chown=nodejs:nodejs docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

# Expose ports
EXPOSE $PORT 5432 6379

# Switch to non-root user
USER nodejs

# Use tini as init system for proper signal handling
ENTRYPOINT ["tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]