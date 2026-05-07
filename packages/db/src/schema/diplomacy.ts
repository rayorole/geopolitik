/*
 * Diplomacy — Phase 6.
 *
 * Tables in this file land together in 0011_phase_6_foundation. Subsequent
 * Phase 6 slices fill the order handlers + WS deltas + UI; the schema is
 * sized for the full lock-in (treaties, war, alliances, messages, trades).
 *
 * Key invariants:
 *  - `treaty.status='active'` rows uniquely identify a (type, ordered-pair)
 *    relationship. Cooling pacts (`forced_non_aggression`) use the same
 *    table — they're treaties auto-generated on alliance leave/kick/dissolve
 *    and they use `expiresAtTick` to drive auto-expiry.
 *  - `war` rows can be either player-initiated (`fromDefensivePact = false`)
 *    or auto-generated when a defensive pact partner gets dragged in
 *    (`fromDefensivePact = true`). Both kinds insert in the same tick
 *    transaction so the simulation never sees a half-applied war.
 *  - `alliance_membership` is one-per-(allianceId, playerId). The "one
 *    alliance per player per game" rule is enforced at order-time in the
 *    application layer because membership doesn't carry gameId directly
 *    (alliance does, and a player can only be in one alliance which scopes
 *    the gameId via the alliance row).
 *  - `message_read` keys per `(playerId, channel, peerKey)`. peerKey
 *    encodes the conversation: "p:<uuid>" for DM, "a:<uuid>" for alliance
 *    chat, "g" for the broadcast channel.
 */

import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { game, player } from "./game";

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
		gameId: uuid("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		type: treatyType("type").notNull(),
		status: treatyStatus("status").notNull().default("pending"),
		proposerId: uuid("proposer_id")
			.notNull()
			.references(() => player.id, { onDelete: "cascade" }),
		targetId: uuid("target_id")
			.notNull()
			.references(() => player.id, { onDelete: "cascade" }),
		proposedAtTick: integer("proposed_at_tick").notNull(),
		expiresAtTick: integer("expires_at_tick").notNull(),
		activatedAtTick: integer("activated_at_tick"),
		resolvedAtTick: integer("resolved_at_tick"),
		note: text("note"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		uniqActivePair: uniqueIndex("treaty_active_pair_unique")
			.on(t.gameId, t.type, t.proposerId, t.targetId)
			.where(sql`status = 'active'`),
	}),
);

export const war = pgTable("war", {
	id: uuid("id").primaryKey(),
	gameId: uuid("game_id")
		.notNull()
		.references(() => game.id, { onDelete: "cascade" }),
	attackerId: uuid("attacker_id")
		.notNull()
		.references(() => player.id, { onDelete: "cascade" }),
	defenderId: uuid("defender_id")
		.notNull()
		.references(() => player.id, { onDelete: "cascade" }),
	declaredAtTick: integer("declared_at_tick").notNull(),
	endedAtTick: integer("ended_at_tick"),
	fromDefensivePact: boolean("from_defensive_pact").notNull().default(false),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const allianceState = pgEnum("alliance_state", ["active", "dissolved"]);

export const alliance = pgTable(
	"alliance",
	{
		id: uuid("id").primaryKey(),
		gameId: uuid("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		tag: text("tag").notNull(),
		color: text("color").notNull(),
		description: text("description"),
		state: allianceState("state").notNull().default("active"),
		createdAtTick: integer("created_at_tick").notNull(),
		dissolvedAtTick: integer("dissolved_at_tick"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		uniqGameName: unique("alliance_game_name_unique").on(t.gameId, t.name),
		uniqGameTag: unique("alliance_game_tag_unique").on(t.gameId, t.tag),
	}),
);

export const allianceRank = pgEnum("alliance_rank", ["founder", "leader", "member"]);

export const allianceMembership = pgTable(
	"alliance_membership",
	{
		allianceId: uuid("alliance_id")
			.notNull()
			.references(() => alliance.id, { onDelete: "cascade" }),
		playerId: uuid("player_id")
			.notNull()
			.references(() => player.id, { onDelete: "cascade" }),
		rank: allianceRank("rank").notNull().default("member"),
		joinedAtTick: integer("joined_at_tick").notNull(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.allianceId, t.playerId] }),
		uniqPlayer: unique("alliance_membership_player_unique").on(t.playerId),
	}),
);

export const allianceApplication = pgTable("alliance_application", {
	id: uuid("id").primaryKey(),
	allianceId: uuid("alliance_id")
		.notNull()
		.references(() => alliance.id, { onDelete: "cascade" }),
	applicantId: uuid("applicant_id")
		.notNull()
		.references(() => player.id, { onDelete: "cascade" }),
	submittedAtTick: integer("submitted_at_tick").notNull(),
	expiresAtTick: integer("expires_at_tick").notNull(),
	resolvedAtTick: integer("resolved_at_tick"),
	resolution: text("resolution"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const allianceVote = pgTable(
	"alliance_vote",
	{
		applicationId: uuid("application_id")
			.notNull()
			.references(() => allianceApplication.id, { onDelete: "cascade" }),
		voterId: uuid("voter_id")
			.notNull()
			.references(() => player.id, { onDelete: "cascade" }),
		vote: text("vote").notNull(),
		castAtTick: integer("cast_at_tick").notNull(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.applicationId, t.voterId] }),
	}),
);

export const allianceLeaveCooldown = pgTable(
	"alliance_leave_cooldown",
	{
		gameId: uuid("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		playerId: uuid("player_id")
			.notNull()
			.references(() => player.id, { onDelete: "cascade" }),
		expiresAtTick: integer("expires_at_tick").notNull(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.gameId, t.playerId] }),
	}),
);

export const messageChannel = pgEnum("message_channel", ["dm", "alliance", "broadcast"]);

export const message = pgTable("message", {
	id: uuid("id").primaryKey(),
	gameId: uuid("game_id")
		.notNull()
		.references(() => game.id, { onDelete: "cascade" }),
	channel: messageChannel("channel").notNull(),
	senderId: uuid("sender_id")
		.notNull()
		.references(() => player.id, { onDelete: "cascade" }),
	recipientPlayerId: uuid("recipient_player_id").references(() => player.id, {
		onDelete: "cascade",
	}),
	recipientAllianceId: uuid("recipient_alliance_id").references(() => alliance.id, {
		onDelete: "cascade",
	}),
	body: text("body").notNull(),
	sentAtTick: integer("sent_at_tick").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageRead = pgTable(
	"message_read",
	{
		playerId: uuid("player_id")
			.notNull()
			.references(() => player.id, { onDelete: "cascade" }),
		channel: messageChannel("channel").notNull(),
		peerKey: text("peer_key").notNull(),
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
	gameId: uuid("game_id")
		.notNull()
		.references(() => game.id, { onDelete: "cascade" }),
	proposerId: uuid("proposer_id")
		.notNull()
		.references(() => player.id, { onDelete: "cascade" }),
	targetId: uuid("target_id")
		.notNull()
		.references(() => player.id, { onDelete: "cascade" }),
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
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
