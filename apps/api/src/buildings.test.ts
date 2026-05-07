import { describe, expect, it } from "vitest";
import { aggregateBuildingYields, cancelRefund, isAffordable } from "./buildings";

describe("isAffordable", () => {
	const balance = { money: 1000, oil: 500, steel: 800, electronics: 200 };

	it("accepts when every cost component is at or below balance", () => {
		expect(isAffordable({ money: 500, steel: 200 }, balance)).toBe(true);
		expect(isAffordable({ money: 1000, steel: 800 }, balance)).toBe(true);
	});

	it("rejects when any single cost component exceeds balance", () => {
		expect(isAffordable({ money: 1001 }, balance)).toBe(false);
		expect(isAffordable({ money: 100, steel: 801 }, balance)).toBe(false);
		expect(isAffordable({ oil: 501 }, balance)).toBe(false);
		expect(isAffordable({ electronics: 201 }, balance)).toBe(false);
	});

	it("treats unspecified cost fields as zero", () => {
		expect(isAffordable({}, { money: 0, oil: 0, steel: 0, electronics: 0 })).toBe(true);
	});
});

describe("cancelRefund", () => {
	it("refunds 50% per resource, floored", () => {
		expect(cancelRefund({ money: 500, steel: 201 })).toEqual({
			money: 250,
			steel: 100,
			oil: 0,
			electronics: 0,
		});
	});

	it("zero cost yields zero refund", () => {
		expect(cancelRefund({})).toEqual({ money: 0, steel: 0, oil: 0, electronics: 0 });
	});

	it("odd costs floor down (no fractional refund)", () => {
		expect(cancelRefund({ money: 1, steel: 3 })).toEqual({
			money: 0,
			steel: 1,
			oil: 0,
			electronics: 0,
		});
	});
});

describe("aggregateBuildingYields", () => {
	const aliceId = "00000000-0000-0000-0000-000000000001";
	const bobId = "00000000-0000-0000-0000-000000000002";

	it("sums catalog yields per player", () => {
		const out = aggregateBuildingYields([
			{ type: "steel_industry", builtByPlayerId: aliceId, ownerPlayerId: aliceId },
			{ type: "oil_refinery", builtByPlayerId: aliceId, ownerPlayerId: aliceId },
			{ type: "chip_factory", builtByPlayerId: bobId, ownerPlayerId: bobId },
		]);
		const a = out.get(aliceId);
		expect(a?.steel).toBeGreaterThan(0);
		expect(a?.oil).toBeGreaterThan(0);
		const b = out.get(bobId);
		expect(b?.electronics).toBeGreaterThan(0);
		expect(b?.steel ?? 0).toBe(0);
	});

	it("skips buildings on defected cities (owner != builder)", () => {
		const out = aggregateBuildingYields([
			{ type: "steel_industry", builtByPlayerId: aliceId, ownerPlayerId: bobId },
			{ type: "steel_industry", builtByPlayerId: aliceId, ownerPlayerId: null },
		]);
		expect(out.has(aliceId)).toBe(false);
	});

	it("ignores unknown building types", () => {
		const out = aggregateBuildingYields([
			{ type: "not_a_building", builtByPlayerId: aliceId, ownerPlayerId: aliceId },
		]);
		expect(out.has(aliceId)).toBe(false);
	});

	it("military buildings yield nothing in Phase 3", () => {
		const out = aggregateBuildingYields([
			{ type: "army_base", builtByPlayerId: aliceId, ownerPlayerId: aliceId },
			{ type: "air_force_base", builtByPlayerId: aliceId, ownerPlayerId: aliceId },
		]);
		// Inert military buildings do appear in the aggregate but with zero yield
		// in every resource — assert that explicitly.
		const a = out.get(aliceId);
		expect(a).toEqual({ money: 0, oil: 0, steel: 0, electronics: 0 });
	});

	it("research_lab yields nothing in Phase 4 — its value lives in the effects field", () => {
		const out = aggregateBuildingYields([
			{ type: "research_lab", builtByPlayerId: aliceId, ownerPlayerId: aliceId },
			{ type: "steel_industry", builtByPlayerId: aliceId, ownerPlayerId: aliceId },
		]);
		const a = out.get(aliceId);
		expect(a).toBeDefined();
		// research_lab contributes 0 to all resource yields; steel_industry's yield is what we see.
		expect(a?.money).toBe(0);
		expect(a?.oil).toBe(0);
		expect(a?.electronics).toBe(0);
		expect(a?.steel).toBeGreaterThan(0);
	});
});
