import { z } from "zod";
import { FACTION_IDS, type FactionId } from "./factions";
import {
	RES_TIME_TIER_TICKS,
	type ResearchNode,
	type ResearchTreeFile,
	TREE_IDS,
	type TreeId,
	researchTreeFile,
} from "./research-tree";
import { UNIT_TYPES_BY_ID } from "./unit-types";

import natoEuAir from "../data/tech-trees/nato_eu/air.json" with { type: "json" };
import natoEuDeepWater from "../data/tech-trees/nato_eu/deep_water.json" with { type: "json" };
import natoEuGround from "../data/tech-trees/nato_eu/ground.json" with { type: "json" };
import natoEuHelicopters from "../data/tech-trees/nato_eu/helicopters.json" with { type: "json" };
import natoEuMechanized from "../data/tech-trees/nato_eu/mechanized.json" with { type: "json" };
import natoEuNaval from "../data/tech-trees/nato_eu/naval.json" with { type: "json" };
import natoEuSpace from "../data/tech-trees/nato_eu/space.json" with { type: "json" };

import usAir from "../data/tech-trees/us/air.json" with { type: "json" };
import usDeepWater from "../data/tech-trees/us/deep_water.json" with { type: "json" };
import usGround from "../data/tech-trees/us/ground.json" with { type: "json" };
import usHelicopters from "../data/tech-trees/us/helicopters.json" with { type: "json" };
import usMechanized from "../data/tech-trees/us/mechanized.json" with { type: "json" };
import usNaval from "../data/tech-trees/us/naval.json" with { type: "json" };
import usSpace from "../data/tech-trees/us/space.json" with { type: "json" };

import chinaAir from "../data/tech-trees/china/air.json" with { type: "json" };
import chinaDeepWater from "../data/tech-trees/china/deep_water.json" with { type: "json" };
import chinaGround from "../data/tech-trees/china/ground.json" with { type: "json" };
import chinaHelicopters from "../data/tech-trees/china/helicopters.json" with { type: "json" };
import chinaMechanized from "../data/tech-trees/china/mechanized.json" with { type: "json" };
import chinaNaval from "../data/tech-trees/china/naval.json" with { type: "json" };
import chinaSpace from "../data/tech-trees/china/space.json" with { type: "json" };

import russiaAir from "../data/tech-trees/russia/air.json" with { type: "json" };
import russiaDeepWater from "../data/tech-trees/russia/deep_water.json" with { type: "json" };
import russiaGround from "../data/tech-trees/russia/ground.json" with { type: "json" };
import russiaHelicopters from "../data/tech-trees/russia/helicopters.json" with { type: "json" };
import russiaMechanized from "../data/tech-trees/russia/mechanized.json" with { type: "json" };
import russiaNaval from "../data/tech-trees/russia/naval.json" with { type: "json" };
import russiaSpace from "../data/tech-trees/russia/space.json" with { type: "json" };

/*
 * Research catalog — Phase 4 cross-tree loader + validator.
 *
 * Imports all 4 × 7 = 28 tree files at module load, parses each through the
 * per-file schema, then runs cross-tree integrity checks:
 *
 *   1. Every node's `prereqs` references an existing node ID in the SAME tree
 *      (cross-tree prereqs are forbidden — Q8 locked independent trees).
 *   2. Every tier-N+1 node has at least one tier-N node in the same tree as
 *      a prereq (family-strict + tier-loose entry rule from Q7).
 *   3. Every `unlocks.unitTypes` entry resolves in unit-types.json.
 *   4. Every node's `unlocks.unitTypes` unit's `faction` matches the tree's
 *      faction (no cross-faction unit reuse).
 *
 * A failed validator throws at module load — deploy-time failure, not runtime.
 */

const RAW_FILES: Record<FactionId, Record<TreeId, unknown>> = {
	nato_eu: {
		ground: natoEuGround,
		mechanized: natoEuMechanized,
		helicopters: natoEuHelicopters,
		air: natoEuAir,
		naval: natoEuNaval,
		deep_water: natoEuDeepWater,
		space: natoEuSpace,
	},
	us: {
		ground: usGround,
		mechanized: usMechanized,
		helicopters: usHelicopters,
		air: usAir,
		naval: usNaval,
		deep_water: usDeepWater,
		space: usSpace,
	},
	china: {
		ground: chinaGround,
		mechanized: chinaMechanized,
		helicopters: chinaHelicopters,
		air: chinaAir,
		naval: chinaNaval,
		deep_water: chinaDeepWater,
		space: chinaSpace,
	},
	russia: {
		ground: russiaGround,
		mechanized: russiaMechanized,
		helicopters: russiaHelicopters,
		air: russiaAir,
		naval: russiaNaval,
		deep_water: russiaDeepWater,
		space: russiaSpace,
	},
};

function parseAndValidateAll(): Record<FactionId, Record<TreeId, ResearchTreeFile>> {
	const errors: string[] = [];
	const out = {} as Record<FactionId, Record<TreeId, ResearchTreeFile>>;

	// Per-file Zod parse first.
	for (const faction of FACTION_IDS) {
		out[faction] = {} as Record<TreeId, ResearchTreeFile>;
		for (const tree of TREE_IDS) {
			const raw = RAW_FILES[faction][tree];
			const parsed = researchTreeFile.safeParse(raw);
			if (!parsed.success) {
				errors.push(`tech-trees/${faction}/${tree}.json invalid: ${parsed.error.message}`);
				continue;
			}
			if (parsed.data.faction !== faction) {
				errors.push(
					`tech-trees/${faction}/${tree}.json declares faction=${parsed.data.faction} (expected ${faction})`,
				);
				continue;
			}
			if (parsed.data.tree !== tree) {
				errors.push(
					`tech-trees/${faction}/${tree}.json declares tree=${parsed.data.tree} (expected ${tree})`,
				);
				continue;
			}
			out[faction][tree] = parsed.data;
		}
	}

	if (errors.length > 0) {
		throw new Error(`research catalog validation failed:\n  ${errors.join("\n  ")}`);
	}

	// Cross-tree validators.
	for (const faction of FACTION_IDS) {
		for (const tree of TREE_IDS) {
			const file = out[faction][tree];
			const idsInTree = new Set(file.nodes.map((n) => n.id));
			const tiersById = new Map(file.nodes.map((n) => [n.id, n.tier]));

			for (const node of file.nodes) {
				// Rule 1: prereqs must reference IDs in the same tree.
				for (const prereq of node.prereqs) {
					if (!idsInTree.has(prereq)) {
						errors.push(
							`${faction}/${tree}: node ${node.id} prereq '${prereq}' not found in same tree`,
						);
					}
				}
				// Rule 2: tier-loose entry — every tier-N+1 node has at least one tier-N parent.
				if (node.tier > 0) {
					const expectedParentTier = node.tier - 1;
					const hasParentTier = node.prereqs.some((p) => tiersById.get(p) === expectedParentTier);
					if (!hasParentTier) {
						errors.push(
							`${faction}/${tree}: tier-${node.tier} node ${node.id} has no tier-${expectedParentTier} parent`,
						);
					}
				}
				// Rule 3: unlocks.unitTypes resolve.
				for (const unitId of node.unlocks.unitTypes) {
					const stub = UNIT_TYPES_BY_ID.get(unitId);
					if (!stub) {
						errors.push(
							`${faction}/${tree}: node ${node.id} unlocks unknown unit-type '${unitId}'`,
						);
						continue;
					}
					// Rule 4: unit's faction matches tree's faction.
					if (stub.faction !== faction) {
						errors.push(
							`${faction}/${tree}: node ${node.id} unlocks unit '${unitId}' from foreign faction '${stub.faction}'`,
						);
					}
				}
			}
		}
	}

	if (errors.length > 0) {
		throw new Error(`research catalog cross-tree validation failed:\n  ${errors.join("\n  ")}`);
	}

	return out;
}

export const RESEARCH_CATALOG: Record<
	FactionId,
	Record<TreeId, ResearchTreeFile>
> = parseAndValidateAll();

export function getTree(faction: FactionId, tree: TreeId): ResearchTreeFile {
	return RESEARCH_CATALOG[faction][tree];
}

export function getAllTreesForFaction(faction: FactionId): ResearchTreeFile[] {
	return TREE_IDS.map((t) => RESEARCH_CATALOG[faction][t]);
}

export function findNode(faction: FactionId, nodeId: string): ResearchNode | undefined {
	for (const tree of TREE_IDS) {
		const found = RESEARCH_CATALOG[faction][tree].nodes.find((n) => n.id === nodeId);
		if (found) return found;
	}
	return undefined;
}

export function tier0NodeIdsForFaction(faction: FactionId): string[] {
	const ids: string[] = [];
	for (const tree of TREE_IDS) {
		for (const node of RESEARCH_CATALOG[faction][tree].nodes) {
			if (node.tier === 0) ids.push(node.id);
		}
	}
	return ids;
}

/** Returns the time-tick value for a tier (for default authoring; nodes can override). */
export function defaultResearchTimeTicksForTier(tier: 1 | 2 | 3 | 4): number {
	return RES_TIME_TIER_TICKS[tier];
}

// Re-export the Zod parser for runtime use elsewhere (e.g., tests).
export { researchTreeFile, type ResearchTreeFile, type ResearchNode } from "./research-tree";

// Resource keys used by research costs.
export const RESEARCH_RESOURCE_KEYS = ["money", "oil", "steel", "electronics"] as const;
export type ResearchResourceKey = (typeof RESEARCH_RESOURCE_KEYS)[number];

export const researchResourceKey = z.enum(RESEARCH_RESOURCE_KEYS);
