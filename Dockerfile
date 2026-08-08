FROM node:20-bookworm-slim

# build toolchain for better-sqlite3 native module
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV PORT=3000
ENV DB_PATH=/app/data/stash.db
EXPOSE 3000
CMD ["node", "server.js"]
