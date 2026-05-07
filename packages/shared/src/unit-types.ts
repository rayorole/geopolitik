import { z } from "zod";
import unitTypesJson from "../data/unit-types.json" with { type: "json" };
import { factionId } from "./factions";

/*
 * Unit type stubs — Phase 4.
 *
 * Forward-reference catalog for `unlocks.unitTypes[]` IDs in research nodes.
 * Phase 4 ships only identity + faction + categoryHint here; Phase 5 lands
 * combat stats (hp, attack, move speed, fuel burn) on top.
 *
 * Validator in research-catalog asserts every research-node `unlocks.unitTypes`
 * entry resolves here.
 */

export const unitCategoryHint = z.enum([
	"infantry",
	"transport",
	"ifv",
	"mbt",
	"sp_artillery",
	"helicopter_attack",
	"helicopter_transport",
	"fighter",
	"multirole",
	"bomber",
	"awacs",
	"corvette",
	"frigate",
	"missile_boat",
	"destroyer",
	"cruiser",
	"carrier",
	"submarine",
	"satellite_recon",
	"satellite_comms",
]);
export type UnitCategoryHint = z.infer<typeof unitCategoryHint>;

export const unitTypeStub = z
	.object({
		id: z
			.string()
			.min(1)
			.max(64)
			.regex(/^[a-z0-9_]+$/, "id must be snake_case"),
		displayName: z.string().min(1).max(96),
		shortName: z.string().min(1).max(32),
		faction: factionId,
		categoryHint: unitCategoryHint,
	})
	.strict();
export type UnitTypeStub = z.infer<typeof unitTypeStub>;

export const unitTypesCatalog = z
	.object({
		version: z.literal(1),
		unitTypes: z.array(unitTypeStub),
	})
	.strict()
	.superRefine((c, ctx) => {
		const seen = new Set<string>();
		for (let i = 0; i < c.unitTypes.length; i += 1) {
			const u = c.unitTypes[i];
			if (!u) continue;
			if (seen.has(u.id)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `duplicate unit type id: ${u.id}`,
					path: ["unitTypes", i, "id"],
				});
			}
			seen.add(u.id);
		}
	});
export type UnitTypesCatalog = z.infer<typeof unitTypesCatalog>;

export const UNIT_TYPES_CATALOG: UnitTypesCatalog = unitTypesCatalog.parse(unitTypesJson);

export const UNIT_TYPES_BY_ID = new Map<string, UnitTypeStub>(
	UNIT_TYPES_CATALOG.unitTypes.map((u) => [u.id, u]),
);

export function getUnitTypeStub(id: string): UnitTypeStub | undefined {
	return UNIT_TYPES_BY_ID.get(id);
}
