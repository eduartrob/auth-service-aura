FROM node:20-alpine

WORKDIR /usr/src/app


# Install OpenSSL (required by Prisma 7.x)
RUN apk add --no-cache openssl

COPY package*.json ./

RUN npm install

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Copy entrypoint script
COPY scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
CMD [ "npm", "start" ]
