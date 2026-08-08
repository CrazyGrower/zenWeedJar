FROM node:20-bookworm-slim

# build toolchain for better-sqlite3 native module
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# Drop root. The node image ships an unprivileged `node` user (uid 1000);
# `data/` must exist and be writable by it, since the bind mount's ownership
# comes from the host — see README ("Permissions du volume").
RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV PORT=3000
ENV DB_PATH=/app/data/stash.db
EXPOSE 3000

# node:20-bookworm-slim has no curl; Node 20 has a global fetch.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
