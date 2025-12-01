FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Deploy migrations
RUN npx prisma migrate deploy

EXPOSE 3001

CMD [ "npm", "start" ]
