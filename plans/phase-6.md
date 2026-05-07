# Phase 6 — Diplomacy

> Locked design from grilling on 2026-05-07. Source of truth for the Phase 6 PRD issue and the 6a–6f slice issues.

## Drawer & shell

- **Bottom drawer, fullscreen overlay.** Same shell as the Phase 4 Research drawer. Map stays mounted underneath; dismiss returns to map without route change.
- **Trigger button** lives next to the existing Research button on the in-game canvas. Same row, same visual treatment.
- **Badges on the trigger button:**
  - Red dot — unresolved proposals waiting on player (incoming treaty proposals, alliance applications/votes, trade offers).
  - Amber dot — unread messages.
- **Toast on receipt** for every inbound proposal/DM/broadcast (~6 s, dismissable). No dedicated notifications panel until Phase 7.
- **Four tabs:** Nations / Alliances / Messages / Trades.

## Tab 1 — Nations

- Lists all ~140 nations in the world.
- Visually split into two groups:
  - **Active Powers** — countries currently held by a human player.
  - **Sleeper Nations** — `Open` (no player yet) and `Computer` (AI/stationary; Phase 8 will animate them).
- Each card shows: flag, country name, **leader name**, city count, status badge.
- Status badge — three states:
  - `Taken` — solid signal-color badge with player display name as the leader name.
  - `Open` — neutral badge, real-leader name (e.g. "Donald J. Trump").
  - `Computer` — info badge, real-leader name.
- **Per-nation actions** on each card:
  - Propose treaty (modal with treaty-type picker)
  - Propose trade (opens Trades tab pre-filled)
  - Send message (opens Messages tab pre-filled)
  - Declare war (confirm modal; rejected by server if any blocker active)

### Leader names — `leaders.json`

Real-leader names are sourced from `packages/shared/data/leaders.json`. Schema:

```json
{
  "USA": { "name": "Donald J. Trump", "title": "President" },
  "RUS": { "name": "Vladimir Putin", "title": "President" },
  "FRA": { "name": "Emmanuel Macron", "title": "President" },
  "DEU": { "title": "Chancellor" }
}
```

- `name` — optional. When present, rendered verbatim.
- `title` — required. Used as fallback `"<title> of <countryName>"` when `name` is absent.
- ISO3 missing from map → falls back to `"Head of State of <countryName>"`.

The renderer always prefers `name` when present. Dropping the `name` field everywhere is a one-file edit if real names ever need to be removed (legal mitigation per CLAUDE.md guardrails).

For player-controlled nations the player's display name overrides the leader name entirely; `leaders.json` is only consulted for `Open` and `Computer` nations.

## Tab 2 — Alliances

(Renamed from "Coalitions" in the original drawer pitch — `alliance` is the canonical term throughout schema, code, UI.)

### Identity

- **Name** — text, max 40 chars, unique per game.
- **Tag** — uppercase letters/numbers, 3–5 chars, unique per game (e.g. `NATO`, `WARSAW`).
- **Color** — picked from the 12 `--color-faction-NN` tokens. May collide with member colors.
- **Description** — optional, max 280 chars.
- No custom icon at Phase 6; tag renders inside an `AffiliationFrame` from the icon library.

### Ranks

- **Founder** — the creator. Permanent unless they leave. On leave, ownership transfers to the longest-tenured remaining member.
- **Leader** — promoted by founder or another leader. Shares all admin powers with founder *except* demoting other leaders.
- **Member** — basic membership.

| Action | Founder | Leader | Member |
|---|---|---|---|
| Promote member → leader | ✓ | ✓ | — |
| Demote leader → member | ✓ | — | — |
| Kick member | ✓ | ✓ | — |
| Edit name/tag/color/description | ✓ | ✓ | — |
| Dissolve alliance | ✓ | ✓ | — |
| Vote on incoming application | ✓ | ✓ | ✓ |
| Send chat | ✓ | ✓ | ✓ |
| Leave | ✓ | ✓ | ✓ |

### Mechanical effects (all stack while in alliance)

1. **Alliance chat** — group channel, members-only, persistent.
2. **Implicit non-aggression** — members cannot declare war on each other; `declare_war` order rejected with `alliance_co_member`.
3. **Implicit defensive pact** — when any member is attacked, all other members auto-enter the war on the same tick.
4. **Shared sight** — all alliance members see each other's fog-of-war / sighted units / scope reveals (Phase 7 retro-fits scope plumbing). At Phase 6 this is a flag only; Phase 7 enforces the actual reveal.

### Joining — apply-to-vote

- Non-member submits an application; alliance members vote approve/reject.
- **Majority of total members** must vote approve. Non-vote = no.
- **Application expires after 48 ticks** (24 min) if not resolved.
- 1-member alliance: founder's single approve = trivial accept.

### Leaving — cooldowns

- **Re-apply cooldown:** the leaver cannot apply to *any* alliance for 144 ticks (1.2 h).
- **Post-leave neutrality:** auto-generated `forced_non_aggression` treaty rows between the leaver and each former member, **bidirectional**, expires `current_tick + 240` (2 h).
  - Same mechanic fires on **leave**, **kick**, and **alliance dissolution**.
  - Server rejects `declare_war` between any pair while their `forced_non_aggression` is still active.
  - Multiple stale cooling pacts between the same pair: longest-active wins.
- Alliance **dissolves** when the last member leaves.

## Tab 3 — Messages

Discord-style; three channel kinds.

| Channel | Audience | How accessed |
|---|---|---|
| **DM** | 1:1 with any specific nation/player | One conversation per pair. Selected from a sidebar of pinned + recent contacts. |
| **Alliance chat** | Members of your alliance | Single thread, only visible while you are a member. Cleared from your view (but persisted server-side) on leave. |
| **Broadcast** | Every player in the game | Single global thread. Sender flag + nation name on every line. |

### Constraints (apply to all three channels)

- **Max length** — 2000 chars.
- **Plain text + linebreaks only.** No attachments, no images, no formatting.
- **No edits, no deletes.** Messages are evidentiary.
- **Persistence** — lifetime of the game.
- **Delivery** — WS push for online recipients; persisted Postgres rows for offline.

### Rate limits (Upstash sliding-window)

- **DM + alliance chat** — 30 messages/min per sender (combined).
- **Broadcast** — 5 messages/hour per sender (separate bucket).

### Notifications

- WS `dm` outbound to recipient(s) on send.
- Unread count on the drawer button (amber dot).
- Toast on receipt while drawer is closed.

## Tab 4 — Trades

### Mechanic

- **Free-form pricing.** Sender picks any combination of `{ money, oil, steel, electronics }` for both the give-bundle and the receive-bundle.
- **Atomic one-shot exchange.** When the recipient accepts, the entire swap settles in a single tick — NOT a per-tick recurring trade.
- **Unlimited concurrent open offers** per player.
- **24-tick proposal expiry** if not accepted.

### Lifecycle

1. Proposer fills a form: recipient nation + give-bundle + receive-bundle + optional 280-char message.
2. Server validates proposer has the give-bundle in inventory **at proposal time**. Reserves it? — no: validation re-runs at acceptance time, so over-promising just causes the recipient's accept to bounce.
3. Recipient sees offer in their Trades tab + toast. Accept / reject / let expire.
4. On accept: server re-validates both sides have inventory at the moment of acceptance, then queues an internal `trade_settle` action that executes in the next tick — proposer's give-bundle leaves their pool, recipient's receive-bundle leaves theirs, both deltas land in a single tick transaction.
5. WS broadcast `trade_settled` to both parties on resolution.

### Why one-shot, not per-tick

Per-tick trade routes are a Phase 8+ extension (and require interdiction mechanics for Phase 5 unit gameplay to mean anything). One-shot is enough to make resource imbalances tradeable across players in Phase 6 without coupling the design to Phase 5's military layer.

## Treaties (Nations tab actions, not their own tab)

Five types ship in Phase 6:

| Treaty type | Effect | Break consequence |
|---|---|---|
| `non_aggression` | Both parties cannot declare war on each other while active. | Treaty row deleted; war becomes legal next tick. No rep penalty. |
| `defensive_pact` | If either party is attacked, the other auto-enters the war on the same tick. | Pact row deleted; future attacks no longer trigger entry. |
| `trade_route` | (Phase 6 stub — no per-tick trade settlement yet.) Schema/UI present so Phase 8 can light it up. | Treaty row deleted. |
| `military_access` | Other party's units can move through your territory. (Phase 5 will check this.) | Treaty row deleted. |
| `coalition_war` | Two non-allied parties agree to jointly attack a third party. Once at least one party declares war on the target, the other has 24 ticks to either join or break the treaty. | Treaty row deleted. |

### Proposal flow

- Proposer fills modal: target nation + treaty type + optional 280-char message.
- Server creates `treaty_proposal` row, status `pending`, expires `current_tick + 24`.
- Target sees offer in Nations tab + toast. Accept / reject / let expire.
- On accept: `treaty_proposal` → `treaty` row, status `active`. WS broadcast `treaty_signed` to both.
- On reject / expire: `treaty_proposal` deleted. WS `treaty_rejected` to proposer.

### War declaration

- `declare_war` order, immediate next-tick effect.
- **Server rejects at order-validation time AND inside the tick** if any of the following holds against the target:
  - Active `non_aggression` treaty (either direction).
  - Active `defensive_pact` (either direction).
  - Same-alliance co-membership.
  - Active `forced_non_aggression` (post-leave cooling).
  - You are an ally-of-defensive-pact-partner of the target (transitive: attacking would force your pact partner into a war they didn't choose).
- On accept: `war` row created, status `active`. **Auto-triggers all defensive pacts the target holds** — pact partners enter the war on the same tick (their `war` rows insert in the same transaction).
- Phase 5 reads `war` rows to permit attacks.

## No reputation system

Treaty breaks just remove the treaty's effect — there is no numeric rep score, no rep ledger, no rep events. Social pressure via the broadcast channel is the only enforcement layer.

## Schema (Drizzle)

New tables in `packages/db/src/schema/diplomacy.ts`:

```ts
export const treatyType = pgEnum("treaty_type", [
  "non_aggression",
  "defensive_pact",
  "trade_route",
  "military_access",
  "coalition_war",
  "forced_non_aggression",
]);

export const treatyStatus = pgEnum("treaty_status", ["pending", "active", "expired", "broken"]);

export const treaty = pgTable(
  "treaty",
  {
    id: uuid("id").primaryKey(),
    gameId: uuid("game_id").notNull().references(() => game.id, { onDelete: "cascade" }),
    type: treatyType("type").notNull(),
    status: treatyStatus("status").notNull().default("pending"),
    proposerId: uuid("proposer_id").notNull().references(() => player.id, { onDelete: "cascade" }),
    targetId: uuid("target_id").notNull().references(() => player.id, { onDelete: "cascade" }),
    proposedAtTick: integer("proposed_at_tick").notNull(),
    expiresAtTick: integer("expires_at_tick").notNull(), // pending: proposal expiry; active: cooling expiry (forced_non_aggression only)
    activatedAtTick: integer("activated_at_tick"),
    resolvedAtTick: integer("resolved_at_tick"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // At most one ACTIVE treaty of a given type between an ordered pair.
    uniqActivePair: uniqueIndex("treaty_active_pair_unique")
      .on(t.gameId, t.type, t.proposerId, t.targetId)
      .where(sql`status = 'active'`),
  }),
);

export const war = pgTable("war", {
  id: uuid("id").primaryKey(),
  gameId: uuid("game_id").notNull().references(() => game.id, { onDelete: "cascade" }),
  attackerId: uuid("attacker_id").notNull().references(() => player.id, { onDelete: "cascade" }),
  defenderId: uuid("defender_id").notNull().references(() => player.id, { onDelete: "cascade" }),
  declaredAtTick: integer("declared_at_tick").notNull(),
  endedAtTick: integer("ended_at_tick"),
  // Whether this war row was created by a player order (true) or by an
  // auto-trigger from a defensive pact (false).
  fromDefensivePact: boolean("from_defensive_pact").notNull().default(false),
});

export const allianceState = pgEnum("alliance_state", ["active", "dissolved"]);

export const alliance = pgTable("alliance", {
  id: uuid("id").primaryKey(),
  gameId: uuid("game_id").notNull().references(() => game.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tag: text("tag").notNull(),
  color: text("color").notNull(),
  description: text("description"),
  state: allianceState("state").notNull().default("active"),
  createdAtTick: integer("created_at_tick").notNull(),
  dissolvedAtTick: integer("dissolved_at_tick"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqGameName: unique("alliance_game_name_unique").on(t.gameId, t.name),
  uniqGameTag: unique("alliance_game_tag_unique").on(t.gameId, t.tag),
}));

export const allianceRank = pgEnum("alliance_rank", ["founder", "leader", "member"]);

export const allianceMembership = pgTable(
  "alliance_membership",
  {
    allianceId: uuid("alliance_id").notNull().references(() => alliance.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => player.id, { onDelete: "cascade" }),
    rank: allianceRank("rank").notNull().default("member"),
    joinedAtTick: integer("joined_at_tick").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.allianceId, t.playerId] }),
    // One alliance per player per game — uniqueness enforced at app layer
    // since the gameId lives on alliance, not membership.
  }),
);

export const allianceApplication = pgTable("alliance_application", {
  id: uuid("id").primaryKey(),
  allianceId: uuid("alliance_id").notNull().references(() => alliance.id, { onDelete: "cascade" }),
  applicantId: uuid("applicant_id").notNull().references(() => player.id, { onDelete: "cascade" }),
  submittedAtTick: integer("submitted_at_tick").notNull(),
  expiresAtTick: integer("expires_at_tick").notNull(),
  resolvedAtTick: integer("resolved_at_tick"),
  resolution: text("resolution"), // 'accepted' | 'rejected' | 'expired' | null
});

export const allianceVote = pgTable(
  "alliance_vote",
  {
    applicationId: uuid("application_id").notNull().references(() => allianceApplication.id, { onDelete: "cascade" }),
    voterId: uuid("voter_id").notNull().references(() => player.id, { onDelete: "cascade" }),
    vote: text("vote").notNull(), // 'approve' | 'reject'
    castAtTick: integer("cast_at_tick").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.applicationId, t.voterId] }),
  }),
);

export const allianceLeaveCooldown = pgTable(
  "alliance_leave_cooldown",
  {
    gameId: uuid("game_id").notNull().references(() => game.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => player.id, { onDelete: "cascade" }),
    expiresAtTick: integer("expires_at_tick").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.gameId, t.playerId] }),
  }),
);

export const messageChannel = pgEnum("message_channel", ["dm", "alliance", "broadcast"]);

export const message = pgTable("message", {
  id: uuid("id").primaryKey(),
  gameId: uuid("game_id").notNull().references(() => game.id, { onDelete: "cascade" }),
  channel: messageChannel("channel").notNull(),
  senderId: uuid("sender_id").notNull().references(() => player.id, { onDelete: "cascade" }),
  // For DMs: receiver player. For alliance: alliance id (fk via separate
  // column). For broadcast: null.
  recipientPlayerId: uuid("recipient_player_id").references(() => player.id, { onDelete: "cascade" }),
  recipientAllianceId: uuid("recipient_alliance_id").references(() => alliance.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  sentAtTick: integer("sent_at_tick").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageRead = pgTable(
  "message_read",
  {
    playerId: uuid("player_id").notNull().references(() => player.id, { onDelete: "cascade" }),
    // Pair scope: per (channel, peer) the highest-numbered seen message id.
    channel: messageChannel("channel").notNull(),
    peerKey: text("peer_key").notNull(), // 'p:<uuid>' for DM, 'a:<uuid>' for alliance, 'g' for broadcast
    lastSeenMessageId: uuid("last_seen_message_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.playerId, t.channel, t.peerKey] }),
  }),
);

export const tradeProposalStatus = pgEnum("trade_proposal_status", [
  "pending",
  "accepted",
  "rejected",
  "expired",
]);

export const tradeProposal = pgTable("trade_proposal", {
  id: uuid("id").primaryKey(),
  gameId: uuid("game_id").notNull().references(() => game.id, { onDelete: "cascade" }),
  proposerId: uuid("proposer_id").notNull().references(() => player.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").notNull().references(() => player.id, { onDelete: "cascade" }),
  giveMoney: bigint("give_money", { mode: "number" }).notNull().default(0),
  giveOil: bigint("give_oil", { mode: "number" }).notNull().default(0),
  giveSteel: bigint("give_steel", { mode: "number" }).notNull().default(0),
  giveElectronics: bigint("give_electronics", { mode: "number" }).notNull().default(0),
  receiveMoney: bigint("receive_money", { mode: "number" }).notNull().default(0),
  receiveOil: bigint("receive_oil", { mode: "number" }).notNull().default(0),
  receiveSteel: bigint("receive_steel", { mode: "number" }).notNull().default(0),
  receiveElectronics: bigint("receive_electronics", { mode: "number" }).notNull().default(0),
  note: text("note"),
  status: tradeProposalStatus("status").notNull().default("pending"),
  proposedAtTick: integer("proposed_at_tick").notNull(),
  expiresAtTick: integer("expires_at_tick").notNull(),
  resolvedAtTick: integer("resolved_at_tick"),
});
```

## Order kinds

Add to `order_kind` enum:

| Order | Payload | Validates | On accept |
|---|---|---|---|
| `propose_treaty` | `{ targetId, type, note? }` | target exists + alive; no active treaty of same type with target; not blocked by alliance state | inserts `treaty` row status `pending`, `expiresAtTick = current_tick + 24` |
| `respond_treaty` | `{ treatyId, action: "accept" \| "reject" }` | treaty pending + addressed to player + not expired | `accept` flips status `active`; `reject` flips status `broken` |
| `break_treaty` | `{ treatyId }` | treaty active + player party | status → `broken`; `resolvedAtTick` set |
| `declare_war` | `{ targetId }` | no active blocker treaty/pact/alliance/cooling | inserts `war` row; for each defensive pact target holds, inserts derived `war` row with `fromDefensivePact: true` |
| `propose_trade` | `{ targetId, give: ResourceBundle, receive: ResourceBundle, note? }` | proposer has give-bundle in inventory; target exists | inserts `trade_proposal` pending |
| `respond_trade` | `{ proposalId, action }` | pending + addressed to player + not expired; on accept: both parties have full bundles in inventory at this moment | `accept` schedules `trade_settle` for next tick (transfers atomically); `reject` deletes proposal |
| `create_alliance` | `{ name, tag, color, description? }` | name + tag unique in game; player not already in an alliance; not in `alliance_leave_cooldown` | inserts `alliance` + `alliance_membership` (founder) |
| `apply_alliance` | `{ allianceId }` | alliance exists + active; player not already member; not in cooldown; no pending application to same alliance | inserts `alliance_application` |
| `vote_alliance` | `{ applicationId, vote }` | application pending; voter is member of target alliance; voter has not already voted | inserts `alliance_vote`; if approve count > floor(memberCount/2) on insert: applicant joins atomically |
| `respond_alliance_app` | `{ applicationId, action }` | (admin-only fast path: founder/leader can accept/reject without vote) | flips application resolved |
| `promote_member` | `{ allianceId, playerId }` | player is founder or leader; target is member | upgrades to `leader` |
| `demote_leader` | `{ allianceId, playerId }` | player is founder; target is leader | downgrades to `member` |
| `kick_member` | `{ allianceId, playerId }` | player is founder/leader; target is non-founder member | removes membership; inserts `forced_non_aggression` cooling pacts; sets `alliance_leave_cooldown` |
| `leave_alliance` | `{ allianceId }` | player is member; if founder: founder transfers to longest-tenured before leaving | removes membership; cooling pacts; cooldown |
| `dissolve_alliance` | `{ allianceId }` | player is founder/leader; alliance has > 0 members | flips alliance state `dissolved`; for every pair of remaining members, inserts cooling pacts + cooldowns |
| `send_message` | `{ channel, recipientPlayerId? \| recipientAllianceId? \| null, body }` | channel/recipient combo valid; rate limit not exceeded; body 1–2000 chars; if alliance: sender is member; if broadcast: separate 5/hour bucket | inserts `message`, broadcasts via WS to applicable subscribers |
| `mark_read` | `{ channel, peerKey, lastMessageId }` | message exists | upserts `message_read` |

## WS protocol

New outbound messages:

- `treaty_proposed` — sent to target on `propose_treaty` accept. Carries the proposal row.
- `treaty_signed` — sent to both parties on `respond_treaty: accept`.
- `treaty_rejected` — sent to proposer on reject/expire.
- `treaty_broken` — sent to both parties on `break_treaty`.
- `war_declared` — sent to attacker, defender, and all defensive-pact-triggered parties.
- `trade_proposed` — sent to target on `propose_trade` accept.
- `trade_settled` — sent to both parties on tick settlement.
- `trade_rejected` — sent to proposer.
- `alliance_created` — sent to founder.
- `alliance_application_received` — sent to all current members.
- `alliance_application_resolved` — sent to applicant + members.
- `alliance_member_joined` / `_left` / `_kicked` / `_promoted` / `_demoted` — sent to all current members.
- `alliance_dissolved` — sent to all former members.
- `dm` — sent to recipient. Body: `{ messageId, senderId, body, sentAtTick }`.
- `alliance_message` — sent to all alliance members.
- `broadcast` — sent to all players in the game.

All scoped via Bun WS topics:
- Per-player topic for treaty/trade/dm/alliance-application events.
- Per-alliance topic (subscribe on join, unsubscribe on leave) for alliance chat + alliance state changes.
- Per-game topic (existing) for `broadcast` and `war_declared` (which is public information).

## REST endpoints

- `GET /games/:id/diplomacy/snapshot` — initial drawer load. Returns: alliances player is in, all active treaties involving player, open proposals, recent messages per channel (last 50), unread counts.
- `GET /games/:id/messages?channel=&peer=&before=` — message history pagination.
- `GET /games/:id/alliances` — directory of all alliances in the game (for browsing + applying).

WS deltas drive the live updates from there. TanStack Query cache is the single source of truth per CLAUDE.md.

## UI

- `apps/web/src/components/diplomacy-drawer.tsx` — drawer shell with tab nav.
- `apps/web/src/components/diplomacy/nations-tab.tsx`
- `apps/web/src/components/diplomacy/alliances-tab.tsx`
- `apps/web/src/components/diplomacy/messages-tab.tsx`
- `apps/web/src/components/diplomacy/trades-tab.tsx`
- Reuse existing Badge/Button/UnitIcon/AffiliationFrame components. No new design-system primitives required.
- Toast: implement once via `apps/web/src/components/ui/toast.tsx` (sonner or roll-our-own — sonner preferred), used by all four tabs.

## Done criteria

1. Player A proposes a non-aggression treaty to Player B; B sees it in their drawer + toast; B accepts; both can no longer declare war on each other; treaty visible in both drawers.
2. Player A creates an alliance "NATO" with tag `NATO`. Player B applies. C votes approve. With 2 members (A founder, C voter), A's approve + C's approve = 2/2 majority of total → B joins atomically.
3. Player A and B are in an alliance. A declares war on player C. B's `war` row is auto-created with `fromDefensivePact: true`.
4. Player B leaves the alliance. For 240 ticks, neither A nor B can declare war on the other (server rejects with `forced_non_aggression_active`). After 240 ticks, war is allowed again. B also cannot apply to any alliance for 144 ticks.
5. Player A sends a DM to B. B receives WS push + toast + unread badge. B opens drawer → reads → unread badge clears.
6. Player A sends 30 DMs in 60 s. The 31st is rejected with `rate_limit_exceeded`. Broadcast bucket is independent: A can still send 5 broadcasts/hour.
7. Player A proposes trade `give: 50k oil, receive: 30k steel` to B. B accepts. Next tick: A's oil −50k, A's steel +30k, B's steel −30k, B's oil +50k. Both see `trade_settled`.
8. `leaders.json` renders correctly: USA card shows "Donald J. Trump" while open; once a player picks USA, the card shows that player's display name.
9. Real-leader removal drill: deleting all `name` fields from `leaders.json` cleanly degrades every Sleeper-Nation card to `"<title> of <countryName>"` with no code changes.

## Slice plan

| Slice | Title | Type | Blocks |
|---|---|---|---|
| 6a | Foundation: schema (treaty/war/alliance/message/trade/leaderdata) + drawer shell + tab scaffolding + leaders.json data file | AFK | 6b–6f |
| 6b | Nations tab + leaders.json renderer + per-nation action stubs (open modals only) | AFK | 6c, 6d |
| 6c | Alliances tab end-to-end: create / apply / vote / promote / demote / kick / leave / dissolve + cooldown table + UI | AFK | 6d |
| 6d | Treaties + war: propose/respond/break orders, `declare_war` order, defensive-pact auto-trigger, post-leave `forced_non_aggression` auto-creation (read by 6c's leave path) | AFK | — |
| 6e | Messages: 3 channels (DM/alliance/broadcast) + rate limits + read tracking + WS deltas + toast component | AFK | — |
| 6f | Trades: propose/respond + atomic next-tick settlement | AFK | — |

Out-of-scope, deferred to later phases:

- Phase 5 wiring of `military_access` (units actually crossing) and `war` (units actually attacking). Phase 6 lays the data; Phase 5 reads it.
- Phase 7 espionage actions overlaying the diplomacy surface (e.g. spy reveals enemy treaties).
- Phase 7 plumbing of alliance shared-sight on the map renderer (Phase 6 sets the flag; Phase 7 propagates it through the fog system).
- Phase 8 AI nations actually responding to treaty proposals or alliance applications. Phase 6 just allows targeting them; their incoming actions stay no-ops.
- Phase 8+ recurring per-tick trade routes (the `trade_route` treaty type stub stays inert until Phase 8).
- Phase 9 group chats / DMs-with-multiple-recipients.
- Phase 9 message edits/deletes (currently disallowed by design, but Command Pass could open it up).
