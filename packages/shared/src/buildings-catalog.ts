import { z } from "zod";
import catalogJson from "../data/buildings.json" with { type: "json" };

/*
 * Buildings catalog — Phase 3.
 *
 * Source of truth: packages/shared/data/buildings.json. Numbers use the same
 * ×100 integer scale as nation_state resource columns and tick-formula.ts —
 * "1 unit of money on screen" = 100 in the JSON.
 *
 * The catalog is loaded + parsed at module import time. A bad JSON file is a
 * deploy-time failure, not a runtime one — Zod throws here so the API/web
 * apps fail to boot rather than silently serving a malformed catalog.
 */

export const buildingCategory = z.enum(["economy", "military", "research"]);
export type BuildingCategory = z.infer<typeof buildingCategory>;

export const buildingCost = z
	.object({
		money: z.number().int().nonnegative().optional(),
		steel: z.number().int().nonnegative().optional(),
		oil: z.number().int().nonnegative().optional(),
		electronics: z.number().int().nonnegative().optional(),
	})
	.strict();
export type BuildingCost = z.infer<typeof buildingCost>;

export const buildingYield = z
	.object({
		money: z.number().int().nonnegative().optional(),
		steel: z.number().int().nonnegative().optional(),
		oil: z.number().int().nonnegative().optional(),
		electronics: z.number().int().nonnegative().optional(),
		rp: z.number().int().nonnegative().optional(),
	})
	.strict();
export type BuildingYield = z.infer<typeof buildingYield>;

export const buildingDef = z
	.object({
		type: z.string().min(1).max(64),
		displayName: z.string().min(1).max(64),
		category: buildingCategory,
		cost: buildingCost,
		buildTimeTicks: z.number().int().positive(),
		nationYieldPerTick: buildingYield,
	})
	.strict();
export type BuildingDef = z.infer<typeof buildingDef>;

export const buildingsCatalog = z
	.object({
		version: z.literal(1),
		buildings: z.array(buildingDef).min(1),
	})
	.strict()
	.superRefine((c, ctx) => {
		const seen = new Set<string>();
		for (const b of c.buildings) {
			if (seen.has(b.type)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `duplicate building type: ${b.type}`,
					path: ["buildings"],
				});
			}
			seen.add(b.type);
		}
	});
export type BuildingsCatalog = z.infer<typeof buildingsCatalog>;

export const BUILDINGS_CATALOG: BuildingsCatalog = buildingsCatalog.parse(catalogJson);

export const BUILDING_TYPES = BUILDINGS_CATALOG.buildings.map((b) => b.type) as [
	string,
	...string[],
];

export const buildingType = z.enum(BUILDING_TYPES);
export type BuildingType = z.infer<typeof buildingType>;

export function getBuildingDef(type: string): BuildingDef | undefined {
	return BUILDINGS_CATALOG.buildings.find((b) => b.type === type);
}
