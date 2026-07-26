# --- Build ---
FROM docker.io/library/node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

# --- Serve ---
FROM docker.io/library/nginx:1.27-alpine
# De nginx-image vult ${BACKEND_URL} in bij het opstarten via envsubst.
COPY default.conf.template /etc/nginx/templates/default.conf.template
# API_TOKEN en APP_TITLE komen bij het opstarten in env.js, niet in de build.
COPY env.js.template /etc/nginx/env.js.template
COPY --chmod=755 docker-entrypoint.d/40-generate-env.sh /docker-entrypoint.d/40-generate-env.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
