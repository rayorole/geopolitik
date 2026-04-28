/*
 * Orders — async player intents drained inside the tick transaction.
 * Tick log — audit row per tick attempt; UNIQUE(game, tick) enforces idempotency.
 *
 * Phase 3 adds build / cancel_build / set_slider. Per-kind payload shape is
 * validated by Zod in @geopolitik/shared at the REST boundary; the column
 * stores the parsed JSON verbatim.
 */

import {
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { game, player } from "./game";

export const orderKind = pgEnum("order_kind", ["noop", "build", "cancel_build", "set_slider"]);

export const orderStatus = pgEnum("order_status", [
	"queued",
	"processing",
	"resolved",
	"cancelled",
	"expired",
]);

export const order = pgTable("order", {
	id: uuid("id").primaryKey(),
	gameId: uuid("game_id")
		.notNull()
		.references(() => game.id, { onDelete: "cascade" }),
	playerId: uuid("player_id")
		.notNull()
		.references(() => player.id, { onDelete: "cascade" }),
	kind: orderKind("kind").notNull(),
	payload: jsonb("payload").notNull(),
	status: orderStatus("status").notNull().default("queued"),
	resolvedTick: integer("resolved_tick"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const tickLog = pgTable(
	"tick_log",
	{
		id: uuid("id").primaryKey(),
		gameId: uuid("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		tickNumber: integer("tick_number").notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		durationMs: integer("duration_ms"),
		errorMsg: text("error_msg"),
		retryCount: integer("retry_count").notNull().default(0),
	},
	(t) => ({
		uniqGameTick: unique("tick_log_game_tick_unique").on(t.gameId, t.tickNumber),
	}),
);
