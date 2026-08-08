# PixelStash 🫙

Cozy pixel-art tracker for your jars on a virtual shelf. Node + Express + SQLite,
vanilla frontend, Dockerized for your home server. No accounts, no auth — it is
meant for one person on a home LAN.

## Run locally

```bash
npm install
npm start           # http://localhost:3000
```

## Run tests

```bash
npm test
```

49 tests: the API and repository against an in-memory SQLite database, and the
frontend logic (fill gauge, overflow rule, escaping, shelf placement) run in a
`vm` context, since the browser files are classic scripts with no module system.

## Run with Docker

```bash
docker compose up --build
```

The SQLite database persists in `./data/stash.db` (mounted volume). On first boot
the shelf is seeded with 4 jars totaling 237g; on later boots the seed is skipped,
so your data survives restarts.

### Volume permissions

The container runs as the unprivileged `node` user (uid/gid 1000), so the mounted
`./data` directory must be writable by uid 1000 on the host — the usual case for a
single-user machine. If the container exits with `SQLITE_CANTOPEN`, fix it with:

```bash
sudo chown -R 1000:1000 ./data
```

A `HEALTHCHECK` polls `/api/health`, so `docker ps` reports the container's real
state rather than just "running".

## Configuration

| Variable  | Default                  | Notes                                                      |
|-----------|--------------------------|------------------------------------------------------------|
| `PORT`    | `3000`                   | HTTP port.                                                  |
| `DB_PATH` | `<repo>/data/stash.db`   | The default resolves against the repo, not the working directory, so `npm start` from elsewhere opens the same database instead of seeding a second one. An explicit value is used as given. |

## Reading the shelf

**One jar holds 50g.** Fill is measured against that fixed capacity, not against
the heaviest jar on the shelf — so 25g always looks half full, whatever else you
are storing.

**Past 50g a second jar appears behind the first, holding the overflow.** 77g is
a full jar in front with 27g behind it. It only ever doubles: 500g looks the same
as 150g. The real total is the number on the HUD tag, not a jar count.

Because the kraft label wraps the foot of the jar, anything under roughly 16g is
hidden behind it and the jar reads as empty. That is a known trade-off of the
label placement, not a bug.

**Jars are scattered, not lined up.** They are dealt across the shelves so none
sits empty, and each shelf draws its columns from a shuffled order. Placement is
derived from the jar id, so editing a jar never moves it — only adding or
removing one re-deals the shelves.

**On a screen narrower than the room**, the scene keeps its full size and scrolls
sideways rather than reflowing; it opens centred. The cat's eyes and head follow
the cursor, unless the browser asks for reduced motion.

If the server is unreachable, the HUD reads `HORS LIGNE` and the shelves render
as empty outlines rather than a blank page.

## API

| Method | Route            | Purpose            |
|--------|------------------|--------------------|
| GET    | /api/jars        | list jars          |
| POST   | /api/jars        | create a jar       |
| PUT    | /api/jars/:id    | update a jar       |
| DELETE | /api/jars/:id    | delete a jar       |
| GET    | /api/health      | `{ok:true}` — used by the container healthcheck |

A jar is `{id, name, harvest_date, weight_g, thc_percent, indica_pct, notes,
color_tag, created_at}`. `name` and `weight_g` are required; `weight_g` must be a
finite number ≥ 0. `thc_percent` and `indica_pct` accept `""` or `null` to clear
them. `color_tag` is the cap band colour and must be a `#rrggbb` hex — anything
else falls back to the default green when drawn. Errors come back as
`{"error": "..."}` with a 400, 404 or 500.

## Fonts

`Silkscreen` and `Press Start 2P` are self-hosted under `public/fonts/` (latin and
latin-ext subsets, six files, 17KB total) so the pixel typography survives an
offline client.
Both are SIL Open Font License 1.1 — see `public/fonts/LICENSE.txt`.
