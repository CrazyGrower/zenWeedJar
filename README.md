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
the shelf is seeded with 4 jars totaling 237g.

## API

| Method | Route            | Purpose            |
|--------|------------------|--------------------|
| GET    | /api/jars        | list jars          |
| POST   | /api/jars        | create a jar       |
| PUT    | /api/jars/:id    | update a jar       |
| DELETE | /api/jars/:id    | delete a jar       |
