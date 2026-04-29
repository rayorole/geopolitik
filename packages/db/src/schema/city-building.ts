/*
 * City buildings — Phase 3.
 *
 * One row per building instance per (game, city). The build/cancel order
 * inserts/updates rows here under the per-game tick lock; the tick worker
 * matures `in_progress` rows whose `completes_at_tick` has elapsed.
 *
 * `type` is validated against `packages/shared/data/buildings.json` at the
 * application layer (Zod), not the DB — keeps the catalog hot-reloadable in
 * dev without column-level migrations.
 *
 * Uniqueness: per-city duplicates of the same type are forbidden. Enforced
 * by a partial index that ignores cancelled rows so a player can rebuild
 * something they previously cancelled.
 */

import { sql } from "drizzle-orm";
import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { game, player } from "./game";
import { city } from "./world";

export const cityBuildingState = pgEnum("city_building_state", [
	"in_progress",
	"complete",
	"cancelled",
]);

export const cityBuilding = pgTable(
	"city_building",
	{
		id: uuid("id").primaryKey(),
		gameId: uuid("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		cityId: uuid("city_id")
			.notNull()
			.references(() => city.id, { onDelete: "restrict" }),
		type: text("type").notNull(),
		state: cityBuildingState("state").notNull().default("in_progress"),
		startedAtTick: integer("started_at_tick").notNull(),
		completesAtTick: integer("completes_at_tick"),
		builtByPlayerId: uuid("built_by_player_id")
			.notNull()
			.references(() => player.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		uniqActiveTypePerCity: uniqueIndex("city_building_active_unique")
			.on(t.gameId, t.cityId, t.type)
			.where(sql`${t.state} IN ('in_progress', 'complete')`),
	}),
);
