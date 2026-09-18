# Multi-stage Docker build for GridWise Energy Optimization API
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code and docs
COPY src/ ./src/
COPY docs/ ./docs/

# Build TypeScript to JavaScript in /app/dist
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy package manifests and install production-only dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy compiled files and sample data from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs ./docs

# Expose service port
EXPOSE 3000

# Set non-root user for security
USER node

# Start service
CMD ["node", "dist/src/server.js"]
