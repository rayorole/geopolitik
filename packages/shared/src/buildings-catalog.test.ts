import { describe, expect, it } from "vitest";
import {
	BUILDINGS_CATALOG,
	BUILDING_TYPES,
	buildingsCatalog,
	getBuildingDef,
} from "./buildings-catalog";

describe("buildings catalog", () => {
	it("loads exactly 8 buildings", () => {
		expect(BUILDINGS_CATALOG.buildings).toHaveLength(8);
	});

	it("includes all locked Phase 3 entries", () => {
		const types = BUILDINGS_CATALOG.buildings.map((b) => b.type).sort();
		expect(types).toEqual([
			"air_force_base",
			"army_base",
			"chip_factory",
			"oil_refinery",
			"port",
			"recruitment_office",
			"research_lab",
			"steel_industry",
		]);
	});

	it("derives BUILDING_TYPES tuple from the catalog", () => {
		expect(BUILDING_TYPES.length).toBe(8);
		expect(BUILDING_TYPES).toContain("research_lab");
	});

	it("getBuildingDef returns a known type", () => {
		const def = getBuildingDef("steel_industry");
		expect(def).toBeDefined();
		expect(def?.category).toBe("economy");
		expect(def?.nationYieldPerTick.steel).toBeGreaterThan(0);
	});

	it("getBuildingDef returns undefined for an unknown type", () => {
		expect(getBuildingDef("not_a_building")).toBeUndefined();
	});

	it("research_lab carries Phase 4 effects, no rp yield", () => {
		const def = getBuildingDef("research_lab");
		expect(def).toBeDefined();
		expect(Object.keys(def?.nationYieldPerTick ?? {})).toHaveLength(0);
		expect(def?.effects?.researchCostDiscountPct).toBe(10);
		expect(def?.effects?.economyYieldBoostPct).toBe(5);
		expect(def?.effects?.stack).toBe("linear");
		expect(def?.effects?.stackCap).toBe(5);
	});

	it("military buildings are inert in Phase 3 (empty yield)", () => {
		const inert = ["recruitment_office", "army_base", "air_force_base", "port"];
		for (const t of inert) {
			const def = getBuildingDef(t);
			expect(def).toBeDefined();
			expect(Object.keys(def?.nationYieldPerTick ?? {})).toHaveLength(0);
		}
	});
});

describe("buildings catalog parser", () => {
	it("rejects duplicate types", () => {
		const result = buildingsCatalog.safeParse({
			version: 1,
			buildings: [
				{
					type: "dup",
					displayName: "Dup",
					category: "economy",
					cost: { money: 100 },
					buildTimeTicks: 1,
					nationYieldPerTick: {},
				},
				{
					type: "dup",
					displayName: "Dup 2",
					category: "economy",
					cost: { money: 100 },
					buildTimeTicks: 1,
					nationYieldPerTick: {},
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("rejects unknown category", () => {
		const result = buildingsCatalog.safeParse({
			version: 1,
			buildings: [
				{
					type: "x",
					displayName: "X",
					category: "weird",
					cost: { money: 1 },
					buildTimeTicks: 1,
					nationYieldPerTick: {},
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("rejects negative cost", () => {
		const result = buildingsCatalog.safeParse({
			version: 1,
			buildings: [
				{
					type: "x",
					displayName: "X",
					category: "economy",
					cost: { money: -1 },
					buildTimeTicks: 1,
					nationYieldPerTick: {},
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("rejects zero or negative buildTimeTicks", () => {
		const result = buildingsCatalog.safeParse({
			version: 1,
			buildings: [
				{
					type: "x",
					displayName: "X",
					category: "economy",
					cost: { money: 1 },
					buildTimeTicks: 0,
					nationYieldPerTick: {},
				},
			],
		});
		expect(result.success).toBe(false);
	});
});
