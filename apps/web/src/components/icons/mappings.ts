/**
 * Domain → glyph lookups so feature components can pull the right icon
 * without redoing the categorization themselves. Keep these up-to-date
 * whenever new unit categories, building types, or resources land.
 */

import type { UnitCategoryHint } from "@geopolitik/shared/unit-types";
import type { UnitGlyph } from "./index";

/**
 * Map a Phase 4 unit `categoryHint` to a glyph. Used in the research drawer
 * to show what "kind of thing" each tech node unlocks.
 */
export const CATEGORY_TO_GLYPH: Record<UnitCategoryHint, UnitGlyph> = {
	infantry: "infantry",
	transport: "convoy",
	ifv: "armor",
	mbt: "armor",
	sp_artillery: "artillery",
	helicopter_attack: "drone",
	helicopter_transport: "convoy",
	fighter: "air",
	multirole: "air",
	bomber: "air",
	awacs: "radar",
	corvette: "naval",
	frigate: "naval",
	missile_boat: "missile",
	destroyer: "naval",
	cruiser: "naval",
	carrier: "naval",
	submarine: "naval",
	satellite_recon: "sat",
	satellite_comms: "sat",
};

/**
 * Map a Phase 3 building `type` to a glyph.
 */
export const BUILDING_TO_GLYPH: Record<string, UnitGlyph> = {
	steel_industry: "metal",
	oil_refinery: "oil",
	chip_factory: "factory",
	research_lab: "research",
	recruitment_office: "barracks",
	army_base: "barracks",
	air_force_base: "airbase",
	port: "port",
};

/**
 * Map a `nation_state` resource key to a glyph. `money` and `population`
 * intentionally omitted — they read better as plain numbers in our HUD.
 */
export const RESOURCE_TO_GLYPH: Record<string, UnitGlyph> = {
	oil: "oil",
	steel: "metal",
	electronics: "factory",
};
