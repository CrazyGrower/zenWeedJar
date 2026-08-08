# PixelStash 🫙

Cozy pixel-art tracker for your jars on a virtual shelf. Node + Express + SQLite,
vanilla frontend, Dockerized for your home server.

## Run locally

```bash
npm install
npm start           # http://localhost:3000
```

## Run tests

```bash
npm test
```

## Run with Docker

```bash
docker compose up --build
```

The SQLite database persists in `./data/stash.db` (mounted volume). On first boot
the shelf is seeded with 4 jars totaling 237g; on later boots the seed is skipped,
so your data survives restarts.

### Permissions du volume

The container runs as the unprivileged `node` user (uid/gid 1000), so the mounted
`./data` directory must be writable by uid 1000 on the host — the usual case for a
single-user machine. If the container exits with `SQLITE_CANTOPEN`, fix it with:

```bash
sudo chown -R 1000:1000 ./data
```

A `HEALTHCHECK` polls `/api/health`, so `docker ps` reports the container's real
state rather than just "running".

## API

| Method | Route            | Purpose            |
|--------|------------------|--------------------|
| GET    | /api/jars        | list jars          |
| POST   | /api/jars        | create a jar       |
| PUT    | /api/jars/:id    | update a jar       |
| DELETE | /api/jars/:id    | delete a jar       |
