import { describe, expect, it } from "vitest";
import { FACTION_IDS } from "./factions";
import {
	RESEARCH_CATALOG,
	defaultResearchTimeTicksForTier,
	findNode,
	getAllTreesForFaction,
	tier0NodeIdsForFaction,
} from "./research-catalog";
import { TREE_IDS } from "./research-tree";
import { UNIT_TYPES_BY_ID } from "./unit-types";

describe("research catalog — module load", () => {
	it("loads all 4 factions × 7 trees = 28 trees", () => {
		for (const f of FACTION_IDS) {
			for (const t of TREE_IDS) {
				expect(RESEARCH_CATALOG[f][t]).toBeDefined();
				expect(RESEARCH_CATALOG[f][t].nodes.length).toBeGreaterThan(0);
			}
		}
	});

	it("each tree's faction + tree fields match the file path", () => {
		for (const f of FACTION_IDS) {
			for (const t of TREE_IDS) {
				const file = RESEARCH_CATALOG[f][t];
				expect(file.faction).toBe(f);
				expect(file.tree).toBe(t);
			}
		}
	});

	it("every prereq references a node in the same tree", () => {
		for (const f of FACTION_IDS) {
			for (const t of TREE_IDS) {
				const file = RESEARCH_CATALOG[f][t];
				const ids = new Set(file.nodes.map((n) => n.id));
				for (const node of file.nodes) {
					for (const p of node.prereqs) {
						expect(ids.has(p)).toBe(true);
					}
				}
			}
		}
	});

	it("every tier-N+1 node has a tier-N parent in same tree", () => {
		for (const f of FACTION_IDS) {
			for (const t of TREE_IDS) {
				const file = RESEARCH_CATALOG[f][t];
				const tiersById = new Map(file.nodes.map((n) => [n.id, n.tier]));
				for (const node of file.nodes) {
					if (node.tier === 0) continue;
					const expected = node.tier - 1;
					const has = node.prereqs.some((p) => tiersById.get(p) === expected);
					expect(has).toBe(true);
				}
			}
		}
	});

	it("every unlocks.unitTypes resolves in unit-types.json", () => {
		for (const f of FACTION_IDS) {
			for (const t of TREE_IDS) {
				const file = RESEARCH_CATALOG[f][t];
				for (const node of file.nodes) {
					for (const uid of node.unlocks.unitTypes) {
						const stub = UNIT_TYPES_BY_ID.get(uid);
						expect(stub).toBeDefined();
						// Unit's faction must match tree's faction.
						expect(stub?.faction).toBe(f);
					}
				}
			}
		}
	});

	it("every faction's space tree has at least one node unlocking satellite_scope (Phase 7 hook)", () => {
		for (const f of FACTION_IDS) {
			const space = RESEARCH_CATALOG[f].space;
			const hasSat = space.nodes.some((n) => n.unlocks.systems?.includes("satellite_scope"));
			expect(hasSat).toBe(true);
		}
	});

	it("tier-0 nodes are zero-cost, zero-time", () => {
		for (const f of FACTION_IDS) {
			for (const t of TREE_IDS) {
				const tier0 = RESEARCH_CATALOG[f][t].nodes.filter((n) => n.tier === 0);
				for (const n of tier0) {
					expect(n.researchTimeTicks).toBe(0);
					const totalCost =
						(n.cost.money ?? 0) +
						(n.cost.oil ?? 0) +
						(n.cost.steel ?? 0) +
						(n.cost.electronics ?? 0);
					expect(totalCost).toBe(0);
				}
			}
		}
	});

	it("getAllTreesForFaction returns all 7 trees", () => {
		for (const f of FACTION_IDS) {
			expect(getAllTreesForFaction(f)).toHaveLength(7);
		}
	});

	it("tier0NodeIdsForFaction returns at least one tier-0 per tree", () => {
		for (const f of FACTION_IDS) {
			const ids = tier0NodeIdsForFaction(f);
			// At least one per tree.
			expect(ids.length).toBeGreaterThanOrEqual(7);
		}
	});

	it("findNode resolves within a faction", () => {
		// f_5e is the US air tier-0 starter.
		expect(findNode("us", "f_5e")?.tier).toBe(0);
		// Unknown id returns undefined.
		expect(findNode("us", "definitely_not_a_node")).toBeUndefined();
	});

	it("default research time per tier follows the locked schedule", () => {
		expect(defaultResearchTimeTicksForTier(1)).toBe(60);
		expect(defaultResearchTimeTicksForTier(2)).toBe(120);
		expect(defaultResearchTimeTicksForTier(3)).toBe(240);
		expect(defaultResearchTimeTicksForTier(4)).toBe(480);
	});
});
