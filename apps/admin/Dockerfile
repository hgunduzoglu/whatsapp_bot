# --- Build stage -------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY apps/admin/package.json apps/admin/package-lock.json ./
RUN npm ci

COPY apps/admin/ ./

# Injected at build time; the bundle calls this API origin
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# --- Runtime stage -----------------------------------------------------------
FROM nginx:alpine
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
