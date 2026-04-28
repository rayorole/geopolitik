# GeoPolitik

Async, persistent, real-world-map grand strategy browser game. Working name. Solo dev, pre-alpha.

For the full design and stack rationale see [`CLAUDE.md`](./CLAUDE.md). For the phase-by-phase build plan see [`ROADMAP.md`](./ROADMAP.md).

---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3.5 (`bun --version`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- A [Discord application](https://discord.com/developers/applications) for OAuth (see below)

That's it. No Node, no pnpm.

## First-time setup

```bash
# 1. Bring up Postgres + Redis + Mailpit
docker compose up -d

# 2. Install workspace deps
bun install

# 3. (Optional) populate the rest of the shadcn/ui kit
bun run --filter=@geopolitik/web shadcn:bulk-add

# 4. Copy env files and fill in the blanks
cp .env.example .env
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
cp apps/worldgen/.env.example apps/worldgen/.env.local

# 5. Apply DB migrations
bun run db:migrate

# 6. Run everything via Turbo
bun run dev
```

Web: <http://localhost:3000>
API: <http://localhost:3001> (REST + WebSocket on `/ws`)
Mailpit UI: <http://localhost:8025>

## Creating a Discord OAuth application

Required for the "Sign in with Discord" flow at Phase 0.

1. Go to <https://discord.com/developers/applications> and click **New Application**. Name it whatever you want (e.g. `GeoPolitik (dev)`).
2. In the left sidebar, open **OAuth2**.
3. Under **Redirects**, add: `http://localhost:3001/api/auth/callback/discord`. Save.
4. Copy **Client ID** → paste into `apps/api/.env.local` as `DISCORD_CLIENT_ID`.
5. Click **Reset Secret**, copy the value → paste into `apps/api/.env.local` as `DISCORD_CLIENT_SECRET`.
6. Generate a long random string for `BETTER_AUTH_SECRET`:
   ```bash
   bun -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
   ```

You're set. Restart `bun run dev` and the **Continue with Discord** button on `/sign-in` works.

## Common commands

| Command | Purpose |
|---|---|
| `bun run dev` | Start all apps via Turbo |
| `bun run build` | Build all apps |
| `bun run test` | Vitest across the monorepo |
| `bun run test:e2e` | Playwright E2E |
| `bun run lint` | Biome check |
| `bun run format` | Biome format (writes) |
| `bun run typecheck` | `tsc --noEmit` across the workspace |
| `bun run db:generate` | Generate a Drizzle migration from schema diff |
| `bun run db:migrate` | Apply migrations |
| `bun run db:studio` | Drizzle Studio |
| `bun run worldgen --preset=<name>` | Generate a playable world (Phase 1) |
| `docker compose up -d` | Start Postgres + Redis + Mailpit |
| `docker compose down` | Stop them |

## Layout

```
geopolitik/
├── apps/
│   ├── web/         Next 15 — marketing, auth, account, in-game canvas (Phase 1+)
│   ├── api/         Hono on Bun — REST + WS + Better Auth + Stripe (Phase 8)
│   └── worldgen/    Bun CLI — OSM ingest + PostGIS precompute (Phase 1)
├── packages/
│   ├── db/          Drizzle schema + migrations
│   ├── shared/      Zod WS message schemas + shared types
│   ├── ui/          Reserved for cross-app shadcn extraction
│   └── config/      tsconfig variants + Tailwind v4 theme
├── docker/          Local-dev container init scripts
├── docker-compose.yml
└── turbo.json
```

## Phase 0 status

This branch is the foundations layer:
- Turborepo + Bun + Biome + TS strict
- Next 15 + Tailwind v4 + Geist + shadcn (essentials shipped, full kit via `shadcn:bulk-add`)
- Hono + native Bun WS + Better Auth + Discord OAuth + email/password
- Drizzle schema for Better Auth tables only (uuid v7 PKs)
- WS ping/pong round-trip on `/play/[worldId]`
- Vitest + Playwright skeletons
- GitHub Actions CI (lint, typecheck, test, build)
- Multi-stage Dockerfile for `apps/api` (Railway-ready)
- `docker-compose.yml` with PostGIS, Redis, Mailpit

Everything else (world map, ticks, units, combat, monetization, etc.) lives in `ROADMAP.md` Phase 1+.
