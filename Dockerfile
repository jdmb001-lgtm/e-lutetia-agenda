# =========================================================
# E-Lutetia Agenda — image Docker multi-étapes
# =========================================================
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
# Copier les dépendances de production (better-sqlite3 natif inclus)
COPY --from=build /app/node_modules ./node_modules
# Code serveur et frontend
COPY server ./server
COPY public ./public
COPY package.json ./
# Volume pour les données persistantes (SQLite + emails)
VOLUME /data
EXPOSE 3000

# Santé du conteneur
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/index.js"]
