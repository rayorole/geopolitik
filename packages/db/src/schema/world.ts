/*
 * World — geographic substrate, shared across all games.
 *
 * Phase 2 hand-seeds this from a curated GeoNames extract (~75 nations,
 * ~750 cities). Phase 1 worldgen later replaces the seed with the OSM
 * pipeline using the same schema.
 */

import {
	bigint,
	boolean,
	doublePrecision,
	pgTable,
	real,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const country = pgTable("country", {
	code: text("code").primaryKey(),
	name: text("name").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const city = pgTable("city", {
	id: uuid("id").primaryKey(),
	countryCode: text("country_code")
		.notNull()
		.references(() => country.code, { onDelete: "restrict" }),
	name: text("name").notNull(),
	lat: doublePrecision("lat").notNull(),
	lng: doublePrecision("lng").notNull(),
	basePopulation: bigint("base_population", { mode: "number" }).notNull(),
	isCapital: boolean("is_capital").notNull().default(false),
	moneyMult: real("money_mult").notNull().default(1.0),
	steelMult: real("steel_mult").notNull().default(1.0),
	electronicsMult: real("electronics_mult").notNull().default(1.0),
	oilMult: real("oil_mult").notNull().default(0.0),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
