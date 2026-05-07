# Phase 4 — Research & Tech Progression

> Locked design from grilling on 2026-05-07. Source of truth for the Phase 4 PRD issue and the 4a–4e slice issues.

## Core mechanic

- **Research is its own stage.** Completing a node unlocks one or more `unit_type` IDs. Recruitment is Phase 5's job.
- **Lump-sum upfront cost.** `start_research` debits the full cost atomically from `nation_state`. Insufficient pool = order rejected at validation.
- **Cancel returns 50% of paid cost.** Progress lost. Mirrors Phase 3 building cancel exactly.
- **No RP.** Drop `nation_state.rp` column and `research_lab.nationYieldPerTick.rp`.

## Slots

- **2 active research projects per nation** by default.
- New column `nation_state.research_slot_max` (defaults to 2). Phase 9 Command Pass bumps it.
- Slots are pure parallelism gates — no resource competition between active projects under lump-sum.

## Trees and factions

- **7 trees, all independent for research prereqs.**
  - Ground troops, Mechanized, Helicopters, Air, Naval (coastal), Deep-water fleet, Space.
- The Space tree's tier-1 "Recon Satellite" node carries `unlocks.systems: ["satellite_scope"]` — gates Phase 7's pillar-#1 active fog reveal. Other tree → system unlocks live in the same field.
- **4 factions.** Every ISO country code maps to exactly one.
  - `nato_eu` — European NATO equipment (Italy, France, Germany, UK, Spain, Turkey, …)
  - `us` — US equipment (USA, Israel, Japan, South Korea, Australia, Canada, Saudi Arabia, Egypt, …)
  - `china` — Chinese equipment (China, North Korea, Pakistan, …)
  - `russia` — Russian equipment (Russia, Belarus, Iran, Algeria, Vietnam, Cuba, …)
- Mapping rule: **principal arms supplier**. Mixed-source nations get assigned to their dominant supplier.
- `factions.json` holds the full ISO-code → faction map. Validator unit test fails if any code is unmapped.
- **Faction is immutable** at game start (derived from `player.country_code`). Phase 6 alliance-based cross-faction tree access can layer on later via a `nation_state.alliance_faction_access text[]` column without disrupting Phase 4.

## Tiers

- **Five tiers: 0, 1, 2, 3, 4.** Tier 0 is the free starter pack — pre-unlocked at game start, no research required.
- **1990+ era mapping:**

| Tier | Era | US | NATO-EU | Russia | China |
|---|---|---|---|---|---|
| 0 | 1970–90 legacy (free) | M60A3, F-5E | Leopard 1, AMX-30, Mirage F1 | T-72A, MiG-21 | Type 79, J-7 |
| 1 | 1990s standard | M1A1, F-16 Block 30 | Leopard 2A4, Mirage 2000 | T-90, MiG-29A | Type 88, J-8II |
| 2 | 2000s upgrade | M1A2, F-16 Block 50/52 | Leopard 2A6, Rafale F1 | T-90M, Su-30MK | Type 99, J-10A |
| 3 | 2010s modern | M1A2 SEPv3, F-15EX, F/A-18E/F | Leopard 2A7, Rafale F3R, Eurofighter T3 | T-90MS, Su-35 | Type 99A, J-10C, J-16 |
| 4 | 2020s+ cutting edge | M1E3, F-35A, F-22, B-21 | Leopard 2A8, Rafale F4, FCAS, Tempest | T-14, Su-57, Su-75 | Type 100, J-20, J-35 |

- **Time per tier (`research_time_ticks`):** 60 / 120 / 240 / 480 (≈ 30 min / 1 h / 2 h / 4 h at 30 s/tick).
- **Cost magnitude per tier:** scales `~tier^1.5` on top of the per-tree fingerprint.

## Per-tree resource fingerprint

Resources stay at the existing Phase 3 set: `{ money, oil, steel, electronics }`. Tree-flavored default; per-node overrides allowed (Model 3 hybrid).

| Tree | money | oil | steel | electronics |
|---|---|---|---|---|
| Ground | high | low | med | low |
| Mechanized | high | med | **high** | low |
| Helicopters | high | med | med | **high** |
| Air | high | **high** | low | **high** |
| Naval (coastal) | high | low | **high** | med |
| Deep-water | high | **high** | **high** | **high** |
| Space | high | none | low | **high** |

`oil` retains its established roles (Phase 5 ops fuel, Phase 6 trade good) on top of being a procurement input here.

## Prereq graph

- Per-node graph. Each node names `prereqs: string[]` of node IDs.
- **Family-strict, tier-loose.** Sibling chains (Block 50 → 52 → 70) and lineage chains (T-72 → T-90 → T-14) are strict. Cross-family within the same tree: free.
- Validator unit test asserts every tier-N+1 node has at least one tier-N node in the same tree as a prereq.

## Bundling

- Schema: every node has `unlocks: string[]` (unit_type IDs).
- **Mixed by family rule.**
  - **Sibling** (length-1 `unlocks`) for high-impact families: MBTs tier-3+, multirole jets, capital ships, satellites.
  - **Bundled** (length-2+ `unlocks`) for low-impact families: transports, infantry tiers, IFVs at low tier, transport helos.

## Per-node JSON shape

```json
{
  "id": "f16c_block50",
  "tree": "air",
  "tier": 2,
  "displayName": "F-16C Block 50 Fighting Falcon",
  "shortName": "F-16C",
  "prereqs": ["f16a"],
  "unlocks": ["unit_f16c_block50"],
  "cost": { "money": 250000, "oil": 80000, "steel": 30000, "electronics": 90000 },
  "researchTimeTicks": 120,
  "introYear": 1991
}
```

A stub `unit-types.json` ships in Phase 4 (`{ id, displayName, shortName, faction, categoryHint }`); Phase 5 adds combat stats. Validator: every `unlocks` ID must resolve in `unit-types.json`.

## `research_lab` redefinition

Replaces the Phase 3 `rp` yield with two stacking effects on the same building.

```json
{
  "type": "research_lab",
  "displayName": "Research Lab",
  "category": "research",
  "cost": { "money": 80000, "steel": 20000 },
  "buildTimeTicks": 720,
  "nationYieldPerTick": {},
  "effects": {
    "researchCostDiscountPct": 10,
    "economyYieldBoostPct": 5,
    "stack": "linear",
    "stackCap": 5
  }
}
```

- **Cost discount.** −10% per lab, linear, cap 5 → max −50% applied to the upfront `start_research` debit.
- **Economy yield boost.** +5% per lab, linear, cap 5, scoped to `category: "economy"` buildings (steel_industry, oil_refinery, chip_factory) only. Max +25%.
- The `effects` field is a generic effect-bag — future buildings (Phase 5+) can carry different effect shapes without schema churn.

## Schema (Drizzle)

New tables in `packages/db/src/schema/research.ts`:

```ts
export const researchProjectStatus = pgEnum("research_project_status", [
  "in_progress",
  "completed",
  "cancelled",
]);

export const researchProject = pgTable(
  "research_project",
  {
    id: uuid("id").primaryKey(),
    gameId: uuid("game_id").notNull().references(() => game.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => player.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    status: researchProjectStatus("status").notNull().default("in_progress"),
    costMoney: bigint("cost_money", { mode: "number" }).notNull(),
    costOil: bigint("cost_oil", { mode: "number" }).notNull(),
    costSteel: bigint("cost_steel", { mode: "number" }).notNull(),
    costElectronics: bigint("cost_electronics", { mode: "number" }).notNull(),
    startedAtTick: integer("started_at_tick").notNull(),
    expectedCompletionTick: integer("expected_completion_tick").notNull(),
    resolvedAtTick: integer("resolved_at_tick"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Partial unique index: at most one ACTIVE project per node per player.
    // Cancelled/completed rows unconstrained (history retained).
    uniqActive: uniqueIndex("research_project_active_unique")
      .on(t.gameId, t.playerId, t.nodeId)
      .where(sql`status = 'in_progress'`),
  }),
);

export const researchUnlock = pgTable(
  "research_unlock",
  {
    gameId: uuid("game_id").notNull().references(() => game.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => player.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    unlockedAtTick: integer("unlocked_at_tick").notNull(),
    viaProjectId: uuid("via_project_id").references(() => researchProject.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.gameId, t.playerId, t.nodeId] }),
  }),
);
```

Migrations:

- Drop `nation_state.rp`.
- Add `nation_state.research_slot_max integer not null default 2`.
- Update Phase 3 tick logic that read/wrote `rp` (PR #17/#18 lines).
- Drop `nationYieldPerTick.rp` from `research_lab` in `buildings.json`.

Tier 0 starter pack handling: when a player joins a game, seed `research_unlock` rows for every tier-0 node in that player's faction (`viaProjectId = null`).

## Order kinds

Add to `order_kind` enum:

- `start_research` — payload `{ nodeId: string }`.
  - Validates: prereqs all unlocked, active slot count < `research_slot_max`, pool ≥ post-discount cost, node not already unlocked or in_progress, node belongs to player's faction tree.
  - On accept: atomic debit; insert `research_project` row with cost snapshot post-discount; `expected_completion_tick = current_tick + node.researchTimeTicks`.
- `cancel_research` — payload `{ projectId: uuid }`.
  - Validates: project belongs to player; status `in_progress`.
  - On accept: refund 50% of `cost_*` columns; status → `cancelled`; `resolved_at_tick` set.

## WS protocol

All research events are **private** — sent only to the originating player on their own subscription, never on the game-wide topic.

- `research_started` — emitted via `ack` channel when `start_research` is accepted.
- `research_completed` — emitted on tick maturation. Carries `{ nodeId, unlockedAtTick }`.
- `research_cancelled` — emitted on `cancel_research` accept. Carries `{ projectId, refund }`.

Other players learn enemy tech via Phase 5 unit appearance in fog-of-war and Phase 7 espionage.

## UI

- **Bottom drawer, fullscreen overlay.** Slides up from below. Map stays mounted underneath; dismiss returns to map without route change.
- Top nav "Research" button alongside existing Phase 3 nav.
- Faction-locked tree picker (segmented control over the player's faction's 7 trees).
- Tree canvas: tier rows top-to-bottom (0 at top, 4 at bottom), families in columns, sibling chains horizontal within a tier. Tier 0 painted as already-unlocked from tick 0.
- Node detail side panel: full name, short name, intro year, cost vector, time, prereqs, "Research" button (disabled with reason tooltip if unsatisfied).
- Active research strip: 2 slots with progress bars, ETA, cancel button per slot.
- Resource bar pinned across the top: `money / oil / steel / electronics` current pool.
- Tree visualization: React Flow (designer's call at PR time).

## Scope (Slice 1 — full target)

- All 4 factions × all 7 trees × all tiers 0–4 populated for alpha. ~200+ nodes.
- Each node carries `displayName` (full official name) and `shortName` (short label).

## Done criteria

1. Player slots two research projects in two different trees; both progress in parallel and complete on schedule.
2. Lab count correctly reduces upfront cost (verified at −10/20/30/40/50% with 1–5 labs) and boosts economy yield correctly (+5/10/15/20/25%).
3. Cancel returns 50% of paid cost and frees the slot; progress lost.
4. Sibling chain enforces strict prereq (cannot research Block 70 without Block 52).
5. Tier-loose validation enforced: a tier-3 node fails to start if no tier-2 in same tree is unlocked.
6. Phase 7 hook live: completing the Space tier-1 "Recon Satellite" node sets up the `unlocks.systems` data the satellite-scope action will read.
7. Faction immutability + per-faction tree visibility: a Belgian player sees only the `nato_eu` tree; an Iranian player sees only the `russia` tree.
8. Private unlocks: enemy player's research never appears in your client.

## Slice plan

| Slice | Title | Type | Blocks |
|---|---|---|---|
| 4a | Foundation: schema + factions + tree-data scaffolding + lab redefinition | AFK | 4b |
| 4b | Drawer UI scaffold + tier 0 seeding (read-only tree) | AFK | 4c |
| 4c | Orders end-to-end (`start_research` + `cancel_research`) | AFK | 4d |
| 4d | Tick maturation + lab effects + Phase 7 system hook | AFK | 4e |
| 4e | Content authoring: all factions × all trees × tiers 0–4 | HITL | — |

Out-of-scope, deferred to later phases:

- Phase 6 alliance-based cross-faction tree access (additive `nation_state.alliance_faction_access` later).
- Phase 7 espionage actions (steal tech, scout enemy tree). The `unlocks.systems` data flag is wired in 4d so Phase 7 can read it.
- Phase 9 Command Pass slot expansion (just bump `research_slot_max`).
- Premium-currency time-skips on in-progress research (Phase 9).
