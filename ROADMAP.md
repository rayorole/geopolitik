# GeoPolitik Roadmap

> **Process rule — read this first, every time.**
> Before implementing any phase below, run a **grilling session**: I (Claude) ask focused questions about scope, mechanics, edge cases, balance, and open decisions for that phase. You answer. Only after the session do we write code or scaffold structure.
> The "Grilling topics" subsection of each phase is a **starting point**, not the full list — I will add follow-ups based on your answers, the current state of the repo, and anything that has changed in adjacent phases since they were planned. If you say "let's start phase N", treat that as the trigger to grill, not to code.

Use /grill-me skill

GeoPolitik is a real-world-map async grand strategy browser game. See `CLAUDE.md` for the tech stack, repo layout, conventions, and the 8-point differentiation list against Conflict of Nations.

Phases are sequential by default. Adjacent phases (notably 5↔6 and 7↔8) can interleave once their grilling has happened. The first 5 phases — through private alpha — are the critical path; everything after is content, scale, and live-ops.

---

## Phase 0 — Foundations
**Goal:** Empty repo → a developer can clone, `docker compose up`, `bun run dev`, log in with Discord, and round-trip a typed WS message.

**In scope**
- Turborepo + Bun + Biome + TS strict + path aliases
- `apps/web` (Next 15, Tailwind v4, shadcn baseline, dark theme)
- `apps/api` (Hono + native Bun WS + Better Auth + Discord OAuth + email/password)
- `packages/db` (Drizzle, initial users/sessions/accounts schema)
- `packages/shared` (Zod WS message schema starter)
- `packages/config` (tsconfig base, Biome config, Tailwind preset)
- `docker-compose.yml`: Postgres+PostGIS, Redis, Mailpit
- GitHub Actions CI: typecheck + lint + test
- Vitest + Playwright skeletons (one passing test each)

(Observability — Sentry, PostHog — deferred. Wired in later phases when there are real signals to capture; full dashboards land in Phase 10.)

**Out of scope**
- Any game logic, map, ticks, payments

**Done criteria**
- Clean machine clone → docker compose → bun install → bun run dev → log in with Discord → send WS ping → typed pong, all under 10 minutes.
- Green CI on a PR.

**Grilling topics**
- Discord OAuth scopes (profile only, or also email / guilds)?
- Better Auth: session lifetime, cookie domain, refresh strategy?
- Branch protection / required CI checks?
- Env management: dotenv, Doppler, Railway secrets, 1Password?
- Drizzle table naming conventions (singular/plural, prefixes)?
- Logging: pino, console-only at MVP, or structured + Better Stack?

---

## Phase 1 — World & Map
**Goal:** Generate a playable world from OSM data and render it interactively in the browser.

**In scope**
- `apps/worldgen` Bun CLI: ingest Geofabrik OSM extracts → PostGIS precompute → SQL+JSON output to `packages/world-data`
- City filter (population threshold per country, target 10–30 cities each, ~140 countries)
- Province rollup via `admin_level=4` ST_Contains
- Adjacency precompute (city-to-city neighbors, naval / air corridor flags)
- Protomaps `.pmtiles` build + R2 upload script
- MapLibre base layer in `apps/web`
- PixiJS v8 as a custom MapLibre layer (sprite per city, ownership ring, faction color)
- Click city → read-only info panel (name, country, population, terrain)
- Fog of war scaffold (per-player visibility table; no active reveal yet)

**Out of scope**
- Any tick simulation, units, buildings, orders
- Active fog reveal mechanics (Phase 6)

**Done criteria**
- `bun run worldgen --preset=earth-small` produces ≤500 cities across ~30 countries.
- World renders in browser at 60fps with all cities drawn.
- Clicking a city shows owner, population, region.

**Grilling topics**
- Which preset worlds at MVP — earth-small only, or also a regional preset (Europe, NATO-vs-SCO, Pacific)?
- Population thresholds — global rule, or a per-country tuning JSON?
- City visual: simple dot, NATO counter, custom Gemini sprite?
- Map projection: Web Mercator default, or Equal Earth?
- Min/max zoom range supported?
- Performance budget: target FPS, max sprites on screen, mobile considered?
- Are seas/oceans walkable for naval, or do we precompute naval lanes?

---

## Phase 2 — Tick Engine & Economy
**Goal:** Worlds advance every 30 seconds. Players see resource numbers tick. WS deltas drive the UI. No combat yet.

**In scope**
- Tick worker process in `apps/api` (single Bun worker; Redis-backed schedule)
- Per-world Postgres lock; transactional tick; idempotent on retry
- Order queue table + REST endpoint to enqueue
- Resource model (exact set TBD in grilling)
- City production rules
- WS `tick` delta broadcast on world topic
- Snapshot REST endpoint for late joiners / desync recovery
- Client reconciliation in Zustand
- Sentry transactions wrapping each tick

**Out of scope**
- Buildings affecting production (Phase 3)
- Combat resolution (Phase 4)

**Done criteria**
- Player joins a world and sees city resource numbers grow every 30s without polling.
- Disconnect/reconnect during a tick → no desync; snapshot endpoint recovers state.
- Tick processing < 2s for a 500-city world (Sentry budget enforced).

**Grilling topics**
- Resource list — exact resources at MVP. (CoN's exact set is a legal risk; pick a different combination.)
- Production formula: city size × terrain × infrastructure, or simpler?
- Dev tick cadence — keep 30s or run faster (e.g., 5s) for testability?
- Order queue: per-player or per-world? TTL? Cancellation rules?
- Delta payload: changed cities only, or per-player snapshot diffs?
- What happens if a tick errors mid-way — full rollback, partial commit, or quarantine the world?

---

## Phase 3 — National Management
**Goal:** Players manage their nation: build in cities, set sliders, unlock research. Bad management causes unrest and city defection (pillar #3).

**In scope**
- Building catalog data (`packages/shared/data/buildings.json`) with cost/effect schema
- Building placement on map (one-tap on owned city, queued with build time)
- Per-city build queue UI
- National sliders: welfare, healthcare, propaganda, taxation (and any others decided in grilling)
- Unrest model: city-level unrest score driven by sliders + events
- City defection rules (high unrest + neighboring foreign influence → flip)
- Research tree (data-driven, no balance pass yet) with WS-pushed completion events
- UI: nation overview, city detail panel, research panel

**Out of scope**
- Buildings producing military units (Phase 4)
- Espionage influencing unrest (Phase 6)

**Done criteria**
- Player builds a building → production changes next tick.
- Cranking taxation to max raises unrest visibly within ~5 ticks; sustained max defects a city.
- Research completes on schedule and unlocks declared prerequisites.

**Grilling topics**
- Building catalog: how many at MVP? Categories? Per-city limit?
- Slider list — exact set, range (0–100, 0–10), update frequency (per-tick or instant)?
- Unrest formula — public design or hidden? Capped, exponential, threshold-based?
- Defection: instant flip, gradual influence, or revolt event?
- Research tree shape — linear, branching, prerequisites; how many techs at MVP?
- Mid-research switching — allowed? Refund? Penalty?

---

## Phase 4 — Military & Combat (private alpha goal)
**Goal:** First unit. First move. First multi-tick battle. Private alpha with 5 friends. Pillars #2, #4, #8.

**In scope**
- Unit catalog with **tech block variants** (e.g., F-16 Block 50/52/70 distinct stats)
- Unit recruitment from cities (cost, time, slot limit)
- Move orders: pathfinding on city graph, **slowest-unit-in-stack convoy speed**
- Combat resolution: **multi-tick, visible health bars, retreat / reinforce windows**
- Damage curves with branch modifiers (land/air/sea/armor types)
- Combat log surfaced via WS `event`
- Minimal AI for unowned cities (defenders only, just enough to make combat feel real)
- Private alpha onboarding (invite-link world creation)

**Out of scope**
- AI nation strategy (Phase 7)
- Espionage during combat (Phase 6)

**Done criteria**
- 5 friends in a private world. Each has units, moves them, engages.
- A battle plays out across multiple ticks with both players watching health change live.
- Slowest-unit convoy works: mixing a tank with a slow truck slows the stack.

**Grilling topics**
- Unit catalog: how many MVP unit types per branch (land/air/sea)?
- Block variants per unit — 1, 2, 3, more?
- Combat math: deterministic with modifiers, or stochastic? Visible to player or hidden roll?
- Stacking limits per city / army?
- Pathfinding on city graph or full geographic distance? Naval and air pathing rules?
- Multi-step queued move orders — supported at alpha?
- Alpha victory condition — open-ended, or a stop point so the test ends cleanly?

---

## Phase 5 — Diplomacy & Trade
**Goal:** Alliances, treaties, inter-player trade. Treaties have teeth (pillar #7).

**In scope**
- Alliance formation, max 6 members
- Alliance chat (or stub here, finished in Phase 9)
- Treaty types: non-aggression, defensive pact, trade pact, peace
- Treaty proposal/accept flow with deadlines
- Inter-player trade orders: per-tick resource flow with price
- Trade route geographic path (interdictable from Phase 6 onward)
- Treaty enforcement: breaking a defensive pact triggers automatic mechanical cost (reputation, diplomatic penalty)

**Out of scope**
- Trade route interdiction (Phase 6)
- Espionage-driven diplomacy (Phase 6)

**Done criteria**
- Two players sign a defensive pact. A third attacks one; the partner is auto-flagged into the war (or chooses the penalty).
- A trade deal flows resources tick-by-tick until expiration.

**Grilling topics**
- How rigidly does a defensive pact bind — auto-join war, or option to break with a reputation hit?
- Trade pricing: free-form negotiation, anchored to a market index, both?
- Alliance leadership — single leader, council, voting?
- Conditional trade ("I send fuel as long as you stay at war with X")?
- Treaty expiration — fixed term, perpetual, renewable?
- Reputation system — global score, per-faction memory, decay?

---

## Phase 6 — Espionage & Active Fog of War
**Goal:** Spies, satellite scopes, information warfare. Pillars #1 and #7 (enforcement).

**In scope**
- Spy unit type, recruitment, infiltration mechanics
- Espionage actions: steal tech, sow unrest, sabotage building, expose enemy units
- Counter-intelligence (passive defense + active counter-spy actions)
- **Deployable satellite scopes** — spend resource to reveal a region for N ticks (active fog reveal — pillar #1)
- Trade route interdiction (intercept a route, deny resources)
- Information leak mechanics (compromised intel surfaces in feeds)

**Out of scope**
- AI nations using espionage (Phase 7)

**Done criteria**
- Spy infiltrates an enemy capital, steals a tech.
- Satellite scope deployed → fog lifts over a region for the duration.
- A trade route is interdicted → recipient stops receiving resources within 1 tick.

**Grilling topics**
- Spy slots: baseline count, premium-currency expansion?
- Visible vs hidden espionage — does the victim know they were hit?
- Satellite scope: cost, range, duration, cooldown?
- Counter-intel: passive auto-defend, or active player action?
- Trade interdiction: persistent until cleared, or per-tick contested?
- Spy progression: do successful spies level up?

---

## Phase 7 — AI Nations & Dynamic Events
**Goal:** Empty world slots filled with believable AI. Matches stay interesting in week 3+ via dynamic events.

**In scope**
- AI nation behavior: production, recruitment, basic tactical movement, diplomatic responses
- AI difficulty tiers
- Random event system (data-driven JSON catalog): coup attempts, natural disasters, economic shocks, refugee crises
- Match-stagnation detector → triggers dynamic events to shake things up
- Victory conditions: city control %, score threshold, alliance victory
- Match lifecycle: start, ongoing, end, post-mortem screen

**Out of scope**
- Tournament / season metagame (Phase 12)

**Done criteria**
- AI plays a complete 1-week match against a human, using diplomacy and combat without obvious idiocy.
- Stagnant match (no territorial change in 24 ticks) triggers an event that creates new dynamics.
- A match ends cleanly with a victor and a post-mortem.

**Grilling topics**
- AI scope: full nation strategy, or military only? Does AI accept treaties?
- Event catalog size at MVP — 10, 50, 200 events?
- Match length cap — soft (player vote), hard (calendar limit), or victory-only?
- Stagnation signals — what triggers a dynamic event?
- Defeated players: spectate, control AI, or matched into a new world?
- Event authorship: code-only at MVP, or community-submitted later?

---

## Phase 8 — Monetization
**Goal:** Stripe integration, premium currency, subscription, battle pass — without breaking F2P balance and without tripping the Belgian Gaming Commission.

**In scope**
- Stripe Checkout + webhooks in `apps/api`
- Premium currency model in Postgres (transactional, audit-logged)
- Spend sinks: instant build / research completion, reinforcement packs, extra build queues, extra spy slots
- Command Pass subscription tier (Stripe Subscriptions)
- Battle Pass per-season (Stripe one-time)
- Cosmetic-only purchases (camos, profile borders, medals) — no P2W in cosmetic tier
- Refund handling, EU 14-day right of withdrawal disclosures
- Stripe Tax for EU VAT

**Out of scope (forbidden)**
- Lootboxes, gambling-adjacent mechanics, under-18 spend without parental flags

**Done criteria**
- A user can buy gold, spend it on instant build, get refunded — all audited in DB.
- Subscriber gets reduced research times verified end-to-end.
- VAT applied via Stripe Tax for an EU customer.

**Grilling topics**
- Premium currency conversion rate (€1 = how much gold)?
- Bundle structure (small/medium/large/whale)?
- Subscription perks list — finalized before integration
- Battle pass: free + premium tracks, or premium only?
- Refund policy — automated or manual review?
- Receipts: in-game history page, or just Stripe portal?
- Age verification — Discord OAuth signal sufficient, or explicit step?

---

## Phase 9 — Onboarding, Retention & Social
**Goal:** New players survive the first session. Existing players have reasons to log back in.

**In scope**
- Tutorial flow (interactive, in-game, skippable)
- Notification system: email + Discord webhook ping for events of interest (under attack, treaty proposal, research complete)
- Leaderboards (per match, all-time)
- Alliance forum (basic threaded posts, not a full forum)
- Profile / stats page
- Match history
- Friend list

**Out of scope**
- Public matchmaking (Phase 11)

**Done criteria**
- New player completes tutorial in <15 minutes.
- Notifications fire for a defined event set; per-channel opt-out.
- Alliance can hold a multi-day async discussion in the forum.

**Grilling topics**
- Tutorial style: scripted scenario, sandbox with hints, or reactive coaching?
- Notification channels at MVP — email + Discord, or also push, or in-game only?
- Notification volume — opinionated default, or full per-event toggle?
- Leaderboard scoring formula — wins, score, kill/death, custom composite?
- Forum scope — alliance-only at MVP, or also global / faction?

---

## Phase 10 — Anti-Cheat Hardening & Closed Beta
**Goal:** Run a 50-player closed beta with no exploits making the news.

**In scope**
- Adversarial test pass: replay tick logs against modified clients
- WS message fuzzer in CI
- Rate-limit calibration under real load
- Account integrity: device fingerprinting, alt-account detection signals (flag for review, no auto-ban)
- Bug bounty / responsible disclosure landing page
- Closed beta invite system + feedback collection
- Sentry + PostHog dashboards built out

**Done criteria**
- Closed beta runs ≥2 weeks with 50 invited players, no critical exploits, server costs <€100 for the period.
- Crash-free session rate ≥99.5%.

**Grilling topics**
- Cheating tolerance: first warning, instant ban, manual review?
- Bug bounty: paid or recognition-only?
- Beta feedback loop: Discord server, in-game form, both?
- "Critical exploit" vs "minor bug" — what divides them?
- Privacy posture on device fingerprinting — disclosed where?

---

## Phase 11 — Open Beta & Launch
**Goal:** Public, scalable, multiple concurrent worlds. Ship it.

**In scope**
- Public matchmaking lobby
- Multiple concurrent worlds (sharded tick workers, world router)
- World presets (small / medium / large, regional, themed)
- Marketing site polish (landing, features, pricing, FAQ, privacy, ToS)
- Press kit
- Public launch (Discord, r/grandstrategy, Twitter/X)
- Stripe Tax production verification
- Status page (custom or Better Stack)

**Done criteria**
- 200+ concurrent players across 3+ worlds, p95 tick processing within SLO.
- Landing page converts visitor → signup → first tick at ≥X% (target set in grilling).

**Grilling topics**
- Cross-world play: can a player be in multiple matches at once?
- World shard size — 100, 150, 200 players?
- Pricing display — local currency via Stripe estimate, or USD/EUR primary?
- Press strategy — soft launch + influencer keys, or hard launch?
- Day-one server budget cap?

---

## Phase 12 — Live-Ops & Content Cadence
**Goal:** GeoPolitik becomes a service. New content every 4–8 weeks. Retention curves stay healthy.

**In scope (continuous)**
- Seasonal balance patches
- New unit types, new tech, new buildings
- Themed events (alt-history seasons, regional flare-ups)
- Community-driven event design (player-submitted scenarios, vote-to-feature)
- Long-tail retention features (clans-of-clans, persistent rivalries, hall-of-fame)
- Quarterly post-mortems on cheat trends, balance complaints, churn drivers

**Done criteria (rolling)**
- Patch cadence ≥1 major release / 6 weeks.
- Day-30 retention ≥X% (target set at Phase 11 closeout).

**Grilling topics (recurring)**
- Per-season: theme, mechanic twist, balance changes?
- Per-quarter: which retention metric is the worst, and how do we attack it?
- Player-authored content — moderation strategy?
