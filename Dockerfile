# =============================================================================
# VoltForge UI — Standalone Multi-Stage Production Dockerfile
# =============================================================================

# Stage 1: Build static distribution
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Clean install
RUN npm ci

# Copy full UI source code
COPY . .

# Build production bundle
RUN npm run build

# Stage 2: Serve using high-performance Nginx
FROM nginx:1.27-alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
