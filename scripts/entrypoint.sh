#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Starting Auth Service..."

# Run migrations
echo "🔄 Running Prisma migrations..."
npx prisma migrate deploy

# Execute the main command (CMD from Dockerfile)
echo "✅ Starting application..."
exec "$@"
