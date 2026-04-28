/*
 * @geopolitik/world-data — Phase 2 hand-curated test fixture.
 *
 * Sourced from GeoNames (CC-BY 4.0) by `apps/worldgen/scripts/fetch-test-cities.ts`.
 * Phase 1 worldgen replaces test-world.json with the OSM-driven dump using the
 * same Zod schema below.
 */

import { z } from "zod";

export const countryRowSchema = z.object({
	code: z.string().length(3),
	name: z.string(),
	population: z.number().int().nonnegative(),
});

export const cityRowSchema = z.object({
	id: z.string().uuid(),
	countryCode: z.string().length(3),
	name: z.string(),
	lat: z.number(),
	lng: z.number(),
	basePopulation: z.number().int().positive(),
	isCapital: z.boolean(),
	moneyMult: z.number().nonnegative().default(1.0),
	steelMult: z.number().nonnegative().default(1.0),
	electronicsMult: z.number().nonnegative().default(1.0),
	oilMult: z.number().nonnegative().default(0.0),
});

export const testWorldSchema = z.object({
	version: z.literal(1),
	generatedAt: z.string(),
	source: z.string(),
	countries: z.array(countryRowSchema),
	cities: z.array(cityRowSchema),
});

export type CountryRow = z.infer<typeof countryRowSchema>;
export type CityRow = z.infer<typeof cityRowSchema>;
export type TestWorld = z.infer<typeof testWorldSchema>;

export const cityBonusSchema = z.object({
	moneyMult: z.number().nonnegative().optional(),
	steelMult: z.number().nonnegative().optional(),
	electronicsMult: z.number().nonnegative().optional(),
	oilMult: z.number().nonnegative().optional(),
});

export const cityBonusesSchema = z.record(z.string(), cityBonusSchema);

export type CityBonus = z.infer<typeof cityBonusSchema>;
export type CityBonuses = z.infer<typeof cityBonusesSchema>;
