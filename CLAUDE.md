# GeoPolitik

Async, persistent, real-world-map grand strategy browser game. ~140 playable countries, city-level granularity (province rollup), OSM-based geography, ~150 concurrent players per world, multi-week matches, 30-second tick-based offline progression. Direct genre competitor: Conflict of Nations (Bytro / Stillfront) — see "Differentiation & legal guardrails" below.

Working name. Solo dev. Target: private alpha in ~12 weeks.

---

## Tech stack

### Repo & toolchain
- **Turborepo** monorepo, **Bun** as package manager and runtime everywhere. No Node, no pnpm.
- **TypeScript strict** (`strict: true`, `noUncheckedIndexedAccess: true`).
- **Biome** for lint + format (single fast tool).
- **Vitest** for unit/integration tests.
- **Playwright** for E2E.
- **GitHub Actions** for CI: typecheck, lint, test on every PR.

### Frontend (`apps/web`)
- **Next.js 15** App Router. Server components by default for non-interactive surfaces (marketing, auth UI, account, leaderboards, alliance forum, profile, shop). Client components only where interactivity demands it.
- **Tailwind CSS v4** + **shadcn/ui**.
- **Zustand** for client game state (order queue, UI state, optimistic updates).
- **TanStack Query** for server data over REST.
- **MapLibre GL JS** for the OSM base layer. Mounted client-only on the in-game canvas route.
- **PixiJS v8** rendered as a custom MapLibre layer for units, buildings, fog overlay, satellite scope reveals.
- **Protomaps** `.pmtiles` for self-hosted tiles, served from **Cloudflare R2** (no egress fees, no per-tile cost).

### Backend (`apps/api`)
- **Hono** on **Bun**. Single binary serves REST + WebSocket + tick worker.
- **Bun native WebSocket** (`Bun.serve` with the `websocket` handler). No Socket.IO. No Supabase Realtime. Same process as the API, same Postgres pool — cheapest path.
- **Better Auth** for authentication. **Discord OAuth** is the primary social login at launch. Email/password also enabled (Better Auth provides it for free; useful as a fallback).
- **Drizzle ORM** for application schema and queries.
- **Zod** for validation on every WS inbound message and every REST request body.
- **Stripe** for payments and premium currency purchases. Stripe Tax for EU VAT.
- **Upstash Redis** for tick scheduling, deferred order queues, sliding-window rate limits, presence.

### Tick engine
- **30-second tick** interval.
- One Bun worker per world (single worker process for MVP; scale horizontally later via `SELECT FOR UPDATE SKIP LOCKED`).
- A tick = one Postgres transaction. Lock the world row, drain the order queue, recompute resources/movement/combat/research/unrest, commit, broadcast deltas to WS subscribers on the world topic.
- **Server-authoritative everything.** Clients submit orders; clients never compute game state. The client view is a projection of the latest server snapshot plus an optimistic queue of pending orders.

### Database
- **Neon Postgres** for runtime application data. Serverless, generous free tier, fast cold starts.
- **Drizzle migrations** committed to repo (`packages/db/migrations`).
- **Runtime DB does no geometry math.** All spatial work is integer math on pre-computed city / province / adjacency IDs. Neon does not need PostGIS.

### World generation pipeline (`apps/worldgen`)
- One-shot Bun CLI run locally. Inputs: OSM admin boundaries from Geofabrik, OSM `place=city|town` filtered by population.
- **Local PostGIS** (in `docker-compose.yml`) does the heavy spatial work: city → province (`admin_level=4`) `ST_Contains` join, neighbor adjacency precompute, distance matrices, terrain classification.
- Output: SQL dump + JSON files committed under `packages/world-data/`. Runtime DB imports the dump on world creation. Neon never sees PostGIS.

### Game content & data
- **Postgres + JSON in repo.** No Sanity, no headless CMS.
- Static data — building types, unit types, tech tree, balance numbers, flavor text, random event templates — lives in `packages/shared/data/*.json`, typed by Zod schemas. Hot-reloaded in dev, baked into deploys in prod.
- Dynamic data — player progress, orders, unit positions, treaties — lives in Postgres.
- Balance changes ship via PRs and releases, not via a CMS.

### Hosting
- **Frontend (`apps/web`):** Vercel.
- **Backend (`apps/api`):** Railway. Single always-on container running Hono + WS + tick worker.
- **DB:** Neon.
- **Redis:** Upstash.
- **Tiles:** Cloudflare R2.
- **Auth:** Better Auth runs in `apps/api`. No third-party auth service.

### Observability
- **Sentry** for error tracking on `apps/web` and `apps/api`.
- **PostHog** for product analytics. Self-hostable later if scale demands it.

### Visual style
- Modern military HUD. Dark mode primary. NATO unit symbology adapted to a clean, contemporary look — not retro, not skeuomorphic.
- Faction accent colors. Tactical sans-serif typography. Sparing use of glow / scanline effects to read "modern command center," not "1980s war room."
- Unit and building art generated via Gemini (Imagen / Nano Banana) at design time and baked into static assets. Strict style-guide prefix in every prompt; reject anything that breaks consistency.
- UI icons: **Lucide React** + **game-icons.net** (CC-BY, attribute in credits).
- Flags: public-domain SVG set.

---

## Repo layout

```
geopolitik/
├── apps/
│   ├── web/              Next.js 15 — marketing, auth UI, account, leaderboards, alliance forum, in-game canvas route
│   ├── api/              Hono on Bun — REST + WS + tick worker + Better Auth + Stripe webhooks
│   └── worldgen/         Bun CLI — OSM ingest + PostGIS precompute → SQL/JSON output
├── packages/
│   ├── db/               Drizzle schema + migrations + client (shared by api + worldgen)
│   ├── shared/           Zod schemas, WS message types, game constants, JSON game data
│   ├── ui/               shadcn components shared across apps
│   └── config/           tsconfig base, biome config, tailwind preset
├── docker-compose.yml    Postgres + PostGIS, Redis, Mailpit (local dev only)
├── turbo.json
├── package.json
├── bun.lockb
└── CLAUDE.md
```

---

## Local development

Prerequisites: Bun, Docker Desktop.

```bash
# 1. Start local services (PostGIS, Redis, Mailpit for email testing)
docker compose up -d

# 2. Install
bun install

# 3. Run migrations against the local Postgres
bun run db:migrate

# 4. (Optional) Generate a tiny test world
bun run worldgen --preset=test

# 5. Start everything via Turbo
bun run dev
# → apps/web on :3000, apps/api on :3001 (REST + WS)
```

`docker-compose.yml` services:
- `postgres` — PostGIS-enabled Postgres for local dev. Runtime app data and world-gen data both live here locally; in prod they split (Neon for runtime, local PostGIS for world-gen only).
- `redis` — Upstash-compatible Redis for queues, rate limiting, presence.
- `mailpit` — SMTP catcher for testing Better Auth email flows locally.

---

## Common commands

| Command | Purpose |
|---|---|
| `bun run dev` | Start all apps via Turbo |
| `bun run build` | Build all apps |
| `bun run test` | Run Vitest across the monorepo |
| `bun run test:e2e` | Run Playwright E2E |
| `bun run lint` | Biome check |
| `bun run format` | Biome format |
| `bun run typecheck` | `tsc --noEmit` across the workspace |
| `bun run db:generate` | Generate a Drizzle migration from schema diff |
| `bun run db:migrate` | Apply migrations |
| `bun run db:studio` | Drizzle Studio |
| `bun run worldgen --preset=<name>` | Generate a playable world |
| `docker compose up -d` | Start local Postgres + Redis + Mailpit |
| `docker compose down` | Stop local services |

---

## Architecture decisions

### Why these choices over the alternatives
- **No Supabase.** Auth + DB self-hosted via Better Auth on Hono and Neon. Avoids vendor coupling and free-tier limits on Realtime.
- **No Convex.** Tick simulation hammers per-function-call pricing. Postgres + native Bun WS is cheaper at any scale we care about.
- **No Sanity.** Game balance numbers belong in version control. PRs change balance; releases ship balance.
- **No Phaser, no Three.js.** PixiJS v8 is the right level of abstraction for a 2D map overlay.
- **No Mapbox.** Self-hosted Protomaps tiles on R2, zero per-tile cost.
- **No Socket.IO.** Bun's native WS plus a typed protocol covers our needs.

### Tick engine invariants
- A tick is atomic. Either every effect in a tick lands or none do. Wrap each tick in a single Postgres transaction.
- Orders are append-only. The tick consumes the queue under the world lock.
- Clients receive deltas, not full snapshots, except on initial connect or desync recovery.
- A late-joining client fetches a snapshot via REST, then subscribes to WS deltas using the snapshot's `tick_id` as a high-water mark.

### WebSocket protocol
- Single endpoint: `wss://api.geopolitik.example/ws`.
- Auth: Better Auth session cookie validated on the WS upgrade. Reject the upgrade if invalid.
- Inbound messages: typed and Zod-validated against schemas in `packages/shared/ws-messages.ts`. Validation failure = disconnect with a logged reason.
- Outbound message types: `tick` (delta), `event` (random events, alliance invites, treaty proposals, espionage outcomes), `ack` (order accepted / rejected with reason), `desync` (client must refetch snapshot).
- Topics: per-world. A connection is subscribed to exactly one world topic at a time.

### Anti-cheat baseline (non-negotiable, enforced from day one)
- Server-authoritative state. Client state is a projection.
- Every WS inbound message: Zod-validated against a strict schema. Unknown keys rejected.
- Every REST POST: Zod body parsing.
- Per-user sliding-window rate limits in Upstash Redis (orders/min, WS messages/min, REST/min).
- Order validation re-runs inside the tick: cost recheck, range recheck, ownership recheck. Never trust the client's belief about what is legal.

---

## Game design pillars (the 8-point differentiation list)

These are the mechanical hooks that make GeoPolitik **not** Conflict of Nations. Every one must ship by alpha:

1. **Deployable satellite scopes** — fog of war as an active player tool, not passive.
2. **Tech block variants** — F-16 Block 50/52/70 are meaningfully distinct units, not flat tier upgrades.
3. **Cities Skylines national sliders** — welfare / healthcare / propaganda / taxation as a real management layer that drives unrest and city defection.
4. **Slowest-unit convoy speed** — composition matters; mixing a tank with a slow truck slows the whole stack.
5. **City-as-atomic-unit** with province rollup — one level more granular than CoN's province-as-unit.
6. **Real OSM map at city level** — actual geography, not a stylized custom map.
7. **Active inter-player trade with treaty enforcement** — trade routes are interdictable, treaties have real consequences.
8. **Multi-tick visible-progress combat** — battles play out across ticks with retreat / reinforce windows and visible unit health.

Build all eight before alpha. Skipping one weakens both the game and the legal posture.

---

## Differentiation & legal guardrails

We are in a competitive genre and Bytro / Stillfront (CoN) is a known plaintiff. Rules:

- **Game mechanics are not copyrightable.** Real-world-map grand strategy is not protectable.
- **What gets you sued:** copying their art, their UI layout, unit names *they* invented, flavor text, tutorial copy, trade dress (looking "confusingly similar"), or using their trademarks in marketing.
- **Real military hardware names** (F-16, T-90, Leopard 2) — nominative fair use. No manufacturer logos. No reproduced official renders. Keep a "rename and ship a patch" plan ready for any unit that draws complaint.
- **Country names and flags** — public domain, no risk.
- **AI-generated art** — keep prompt logs and seeds. Never prompt "in the style of [other game]". EU AI Act + AI-art copyright are unsettled; provenance records are our defense.

When in doubt, look at the 8-point list above. If a feature isn't differentiating us, it isn't pulling its weight legally either.

---

## Git workflow

- **Repo:** `github.com/rayorole/geopolitik`.
- **Branching:** trunk-based with short-lived feature branches. `main` is always green. Every change lands via PR from a `feat/*`, `fix/*`, `chore/*`, or `refactor/*` branch — one branch per feature/fix, no long-running dev branches.
- Solo dev = self-review on PRs, but PRs still go through CI before merge.
- Keep branches small enough to merge within a day or two. If a feature is bigger, split it into a sequence of stacked PRs rather than a long branch.
- **Commit messages:** Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `ci:`). Not currently enforced by a hook; adopt by discipline so the history stays auto-changelog-ready.
- **Merge style:** squash-only on GitHub. Linear history. Merged branches are kept (not auto-deleted).

---

## Coding conventions

- **TypeScript everywhere.** No `any`. No `as` escape hatches without a one-line comment explaining why.
- **No comments by default.** Add a single-line comment only when the *why* is non-obvious — a hidden invariant, a workaround, surprising behavior. Don't narrate the code.
- **Path aliases per package:** `@geopolitik/db`, `@geopolitik/shared`, `@geopolitik/ui`. Inside `apps/web`: `@/*` → `apps/web/src/*`.
- **Server components by default** in `apps/web`. Mark `"use client"` only when interactive.
- **Zod is the boundary.** Every external input — WS message, REST body, env var, JSON game data file — passes through a Zod parse. Internal code trusts its types.
- **Drizzle for runtime app schema.** Raw SQL is fine inside `apps/worldgen` (PostGIS, one-shot tooling). Avoid raw SQL in the runtime API path unless there is a measured reason.
- **Game balance constants** live in `packages/shared/data/*.json` and are the single source of truth. No magic numbers in code.

---

## Build order (first 90 days)

| Weeks | Milestone |
|---|---|
| 1–2 | Turborepo + Next + Hono + Neon + Better Auth + Discord login + WS round-trip |
| 3–4 | OSM ingest + PostGIS precompute → playable world JSON |
| 5–6 | MapLibre + PixiJS overlay; click city → info panel |
| 7–8 | 30-second tick engine, resource production only, WS deltas |
| 9–10 | Building placement + research tree (data only, no balancing) |
| 11–12 | First unit, first move order, first multi-tick battle. Private alpha with 5 friends. |

If at week 12 friends are moving units around the real-world map and seeing each other's actions tick by tick, the game exists. Everything after is content, balancing, and the long tail.
