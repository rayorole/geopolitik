import { z } from "zod";
import { factionId } from "./factions";

/*
 * Research tree schemas — Phase 4.
 *
 * One JSON file per faction × tree at packages/shared/data/tech-trees/<faction>/<tree>.json.
 * Each file contains the nodes for that one tree-faction pair.
 *
 * Cost vectors mirror buildings.json — display units, ×100 RES_SCALE applied
 * at the tick boundary. Tier 0 nodes are the free starter pack: no cost, no
 * researchTimeTicks, seeded as `research_unlock` rows on player join.
 *
 * Schemas live here; the cross-tree catalog loader + validators live in
 * research-catalog.ts (which imports all 28 files + unit-types + factions
 * and runs full graph integrity checks at module load).
 */

export const treeId = z.enum([
	"ground",
	"mechanized",
	"helicopters",
	"air",
	"naval",
	"deep_water",
	"space",
]);
export type TreeId = z.infer<typeof treeId>;

export const TREE_IDS = [
	"ground",
	"mechanized",
	"helicopters",
	"air",
	"naval",
	"deep_water",
	"space",
] as const satisfies readonly TreeId[];

export const researchTier = z.union([
	z.literal(0),
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
]);
export type ResearchTier = z.infer<typeof researchTier>;

export const researchCost = z
	.object({
		money: z.number().int().nonnegative().optional(),
		oil: z.number().int().nonnegative().optional(),
		steel: z.number().int().nonnegative().optional(),
		electronics: z.number().int().nonnegative().optional(),
	})
	.strict();
export type ResearchCost = z.infer<typeof researchCost>;

export const researchUnlocks = z
	.object({
		// Unit-type IDs from unit-types.json. Length-1 = sibling node;
		// length-2+ = bundled node (player picks the variant at recruit time).
		unitTypes: z.array(z.string().min(1)).min(1),
		// System-level unlocks (e.g., satellite_scope for Phase 7). Optional.
		systems: z.array(z.string().min(1)).optional(),
	})
	.strict();
export type ResearchUnlocks = z.infer<typeof researchUnlocks>;

export const researchNode = z
	.object({
		id: z
			.string()
			.min(1)
			.max(64)
			.regex(/^[a-z0-9_]+$/, "id must be snake_case"),
		tree: treeId,
		tier: researchTier,
		displayName: z.string().min(1).max(96),
		shortName: z.string().min(1).max(32),
		prereqs: z.array(z.string().min(1)),
		unlocks: researchUnlocks,
		cost: researchCost,
		researchTimeTicks: z.number().int().nonnegative(),
		introYear: z.number().int().min(1900).max(2100),
	})
	.strict()
	.superRefine((node, ctx) => {
		// Tier 0 = free starter pack. No cost, no time.
		if (node.tier === 0) {
			const hasCost = Object.values(node.cost).some((v) => v && v > 0);
			if (hasCost) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `tier-0 node ${node.id} must have zero cost (it's free starter pack)`,
					path: ["cost"],
				});
			}
			if (node.researchTimeTicks !== 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `tier-0 node ${node.id} must have researchTimeTicks=0`,
					path: ["researchTimeTicks"],
				});
			}
		}
		// Tier 1+ must have positive researchTimeTicks.
		if (node.tier > 0 && node.researchTimeTicks <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `tier-${node.tier} node ${node.id} must have researchTimeTicks > 0`,
				path: ["researchTimeTicks"],
			});
		}
	});
export type ResearchNode = z.infer<typeof researchNode>;

export const researchTreeFile = z
	.object({
		version: z.literal(1),
		faction: factionId,
		tree: treeId,
		nodes: z.array(researchNode).min(1),
	})
	.strict()
	.superRefine((file, ctx) => {
		// Every node's `tree` field must match the file's tree.
		for (let i = 0; i < file.nodes.length; i += 1) {
			const node = file.nodes[i];
			if (!node) continue;
			if (node.tree !== file.tree) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `node ${node.id} has tree=${node.tree} but file is for tree=${file.tree}`,
					path: ["nodes", i, "tree"],
				});
			}
		}
		// Node IDs must be unique within the file.
		const seen = new Set<string>();
		for (let i = 0; i < file.nodes.length; i += 1) {
			const node = file.nodes[i];
			if (!node) continue;
			if (seen.has(node.id)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `duplicate node id within tree: ${node.id}`,
					path: ["nodes", i, "id"],
				});
			}
			seen.add(node.id);
		}
	});
export type ResearchTreeFile = z.infer<typeof researchTreeFile>;

export const RES_TIME_TIER_TICKS: Record<Exclude<ResearchTier, 0>, number> = {
	1: 60,
	2: 120,
	3: 240,
	4: 480,
};
