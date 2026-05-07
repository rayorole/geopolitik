import { z } from "zod";
import factionsJson from "../data/factions.json" with { type: "json" };

/*
 * Factions — Phase 4.
 *
 * 4 equipment-lineage factions; every playable country code maps to exactly
 * one. The mapping uses the "principal arms supplier" rule: a country with
 * mixed sources is assigned to whichever supplier provides the bulk of its
 * frontline air + armor. Edit `packages/shared/data/factions.json` to revise.
 *
 * Faction is immutable per match (derived from `player.country_code`).
 * Phase 6 alliance-based cross-faction tree access can layer on later via a
 * `nation_state.alliance_faction_access` column without disrupting Phase 4.
 *
 * Catalog parses at module-load time. A bad JSON file is a deploy-time
 * failure, not a runtime one.
 */

export const factionId = z.enum(["nato_eu", "us", "china", "russia"]);
export type FactionId = z.infer<typeof factionId>;

export const factionDef = z
	.object({
		displayName: z.string().min(1).max(64),
		shortName: z.string().min(1).max(16),
		description: z.string().min(1).max(256),
	})
	.strict();
export type FactionDef = z.infer<typeof factionDef>;

export const factionsCatalog = z
	.object({
		version: z.literal(1),
		factions: z.object({
			nato_eu: factionDef,
			us: factionDef,
			china: factionDef,
			russia: factionDef,
		}),
		countryToFaction: z.record(z.string().length(3), factionId),
	})
	.strict()
	.superRefine((c, ctx) => {
		// Every country code is a 3-letter uppercase ISO alpha-3.
		for (const code of Object.keys(c.countryToFaction)) {
			if (!/^[A-Z]{3}$/.test(code)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `country code must be ISO alpha-3 uppercase: ${code}`,
					path: ["countryToFaction", code],
				});
			}
		}
	});
export type FactionsCatalog = z.infer<typeof factionsCatalog>;

export const FACTIONS_CATALOG: FactionsCatalog = factionsCatalog.parse(factionsJson);

export const FACTION_IDS = [
	"nato_eu",
	"us",
	"china",
	"russia",
] as const satisfies readonly FactionId[];

export function factionForCountry(countryCode: string): FactionId | undefined {
	return FACTIONS_CATALOG.countryToFaction[countryCode];
}

export function factionForCountryOrThrow(countryCode: string): FactionId {
	const f = factionForCountry(countryCode);
	if (!f) {
		throw new Error(`country code has no faction mapping: ${countryCode}`);
	}
	return f;
}
