# --- Build stage -------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci

COPY apps/api/prisma ./prisma
RUN npx prisma generate

COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json ./
COPY apps/api/src ./src
RUN npm run build

# --- Runtime stage -----------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# pg_dump is needed for the database backup job
RUN apk add --no-cache postgresql16-client

COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev

COPY apps/api/prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

EXPOSE 3000

# Apply pending migrations, then start the API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
