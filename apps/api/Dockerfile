# --- Build ---
FROM docker.io/library/node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime ---
FROM docker.io/library/node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# node-pg-migrate blijft nodig: de migratiestap draait uit deze image.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY migrations ./migrations

# Draait als een eigen, niet-root gebruiker. Dezelfde uid/gid staat in de
# securityContext van de deployment, zodat het documentenvolume van hem is.
RUN addgroup -g 3001 depart && adduser -u 3001 -G depart -S -H depart
USER 3001:3001

EXPOSE 8080
CMD ["node", "dist/index.js"]
