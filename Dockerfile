# syntax=docker/dockerfile:1.4
# ================================
# AURA Auth Service
# OPTIMIZED: BuildKit cache mounts
# ================================

FROM node:20-alpine

WORKDIR /usr/src/app

# Install OpenSSL (required by Prisma 7.x)
RUN apk add --no-cache openssl

COPY package*.json ./

# Install dependencies with BuildKit cache mount
# Uses cached packages from previous builds when possible
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Copy entrypoint script
COPY scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
CMD [ "npm", "start" ]
