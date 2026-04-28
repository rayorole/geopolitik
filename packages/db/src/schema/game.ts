/*
 * Game — per-match instance state.
 *
 * A game runs on top of the shared world. Per-game-per-city ownership lives
 * in city_state; per-game-per-player resource pools live in nation_state.
 * All resource integers are stored × 100 so tick math stays in pure ints.
 */

import {
	bigint,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { city, country } from "./world";

export const gameStatus = pgEnum("game_status", ["active", "quarantined", "ended"]);

export const game = pgTable("game", {
	id: uuid("id").primaryKey(),
	code: text("code").notNull().unique(),
	status: gameStatus("status").notNull().default("active"),
	tick: integer("tick").notNull().default(0),
	retryCount: integer("retry_count").notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const player = pgTable(
	"player",
	{
		id: uuid("id").primaryKey(),
		gameId: uuid("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		countryCode: text("country_code")
			.notNull()
			.references(() => country.code, { onDelete: "restrict" }),
		color: text("color").notNull(),
		joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		uniqGameCountry: unique("player_game_country_unique").on(t.gameId, t.countryCode),
		uniqGameUser: unique("player_game_user_unique").on(t.gameId, t.userId),
	}),
);

export const cityState = pgTable(
	"city_state",
	{
		gameId: uuid("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		cityId: uuid("city_id")
			.notNull()
			.references(() => city.id, { onDelete: "restrict" }),
		ownerPlayerId: uuid("owner_player_id").references(() => player.id, { onDelete: "set null" }),
		population: bigint("population", { mode: "number" }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.gameId, t.cityId] }),
	}),
);

export const nationState = pgTable(
	"nation_state",
	{
		gameId: uuid("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		playerId: uuid("player_id")
			.notNull()
			.references(() => player.id, { onDelete: "cascade" }),
		money: bigint("money", { mode: "number" }).notNull().default(0),
		oil: bigint("oil", { mode: "number" }).notNull().default(0),
		steel: bigint("steel", { mode: "number" }).notNull().default(0),
		electronics: bigint("electronics", { mode: "number" }).notNull().default(0),
		population: bigint("population", { mode: "number" }).notNull().default(0),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.gameId, t.playerId] }),
	}),
);
