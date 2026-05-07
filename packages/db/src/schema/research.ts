/*
 * Research — Phase 4.
 *
 * Two normalized tables. `research_project` is the audit-trail row for every
 * research project a player has started — in_progress, completed, or cancelled.
 * `research_unlock` is the read-optimized "does the player have node X?"
 * lookup, populated on tick maturation (Phase 4d) and on game-start tier-0
 * seeding (Phase 4b).
 *
 * Cost columns are a snapshot taken at order-accept time, AFTER the lab
 * cost-discount has been applied. Cancel refund (Phase 4c) reads from the
 * snapshot so it doesn't have to recompute the lab discount at cancel time.
 *
 * Node IDs are validated at the application layer (Zod against
 * @geopolitik/shared/research) — same hot-reloadable approach as buildings.
 *
 * Uniqueness: at most one ACTIVE project per node per player. Cancelled and
 * completed rows are unconstrained so history is preserved across a player's
 * full match.
 */

import { sql } from "drizzle-orm";
import {
	bigint,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { game, player } from "./game";

export const researchProjectStatus = pgEnum("research_project_status", [
	"in_progress",
	"completed",
	"cancelled",
]);

export const researchProject = pgTable(
	"research_project",
	{
		id: uuid("id").primaryKey(),
		gameId: uuid("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		playerId: uuid("player_id")
			.notNull()
			.references(() => player.id, { onDelete: "cascade" }),
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
		uniqActive: uniqueIndex("research_project_active_unique")
			.on(t.gameId, t.playerId, t.nodeId)
			.where(sql`status = 'in_progress'`),
	}),
);

export const researchUnlock = pgTable(
	"research_unlock",
	{
		gameId: uuid("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		playerId: uuid("player_id")
			.notNull()
			.references(() => player.id, { onDelete: "cascade" }),
		nodeId: text("node_id").notNull(),
		unlockedAtTick: integer("unlocked_at_tick").notNull(),
		viaProjectId: uuid("via_project_id").references(() => researchProject.id),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.gameId, t.playerId, t.nodeId] }),
	}),
);
