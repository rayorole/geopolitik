import { describe, expect, it } from "vitest";
import {
	applyDiscountToCost,
	countCompletedLabsByPlayer,
	labDiscountPct,
	labEconomyBoostFactor,
	nodeIsAffordable,
	researchCancelRefund,
} from "./research-orders";

describe("labDiscountPct", () => {
	it("returns 0 with no labs", () => {
		expect(labDiscountPct(0)).toBe(0);
	});

	it("scales linearly per lab", () => {
		// research_lab.effects.researchCostDiscountPct = 10, stackCap = 5.
		expect(labDiscountPct(1)).toBe(10);
		expect(labDiscountPct(2)).toBe(20);
		expect(labDiscountPct(3)).toBe(30);
		expect(labDiscountPct(4)).toBe(40);
		expect(labDiscountPct(5)).toBe(50);
	});

	it("caps at stackCap (5)", () => {
		expect(labDiscountPct(6)).toBe(50);
		expect(labDiscountPct(100)).toBe(50);
	});

	it("clamps negative input", () => {
		expect(labDiscountPct(-1)).toBe(0);
	});
});

describe("applyDiscountToCost", () => {
	it("returns the original cost at 0% discount", () => {
		const cost = { money: 1000, oil: 500, steel: 800, electronics: 200 };
		expect(applyDiscountToCost(cost, 0)).toEqual({
			money: 1000,
			oil: 500,
			steel: 800,
			electronics: 200,
		});
	});

	it("halves the cost at 50%", () => {
		const cost = { money: 1000, oil: 500, steel: 800, electronics: 200 };
		expect(applyDiscountToCost(cost, 50)).toEqual({
			money: 500,
			oil: 250,
			steel: 400,
			electronics: 100,
		});
	});

	it("floors fractional results", () => {
		// 999 * 90 / 100 = 899.1 → 899.
		expect(applyDiscountToCost({ money: 999 }, 10)).toEqual({
			money: 899,
			oil: 0,
			steel: 0,
			electronics: 0,
		});
	});

	it("treats missing cost components as zero", () => {
		expect(applyDiscountToCost({}, 10)).toEqual({
			money: 0,
			oil: 0,
			steel: 0,
			electronics: 0,
		});
	});

	it("clamps discount above 100% to zero cost", () => {
		const cost = { money: 1000, oil: 500, steel: 800, electronics: 200 };
		expect(applyDiscountToCost(cost, 150)).toEqual({
			money: 0,
			oil: 0,
			steel: 0,
			electronics: 0,
		});
	});
});

describe("researchCancelRefund", () => {
	it("refunds exactly 50% per resource, floored", () => {
		expect(researchCancelRefund({ money: 500, oil: 200, steel: 800, electronics: 100 })).toEqual({
			money: 250,
			oil: 100,
			steel: 400,
			electronics: 50,
		});
	});

	it("floors odd values", () => {
		expect(researchCancelRefund({ money: 1, oil: 3, steel: 7, electronics: 9 })).toEqual({
			money: 0,
			oil: 1,
			steel: 3,
			electronics: 4,
		});
	});

	it("zero in, zero out", () => {
		expect(researchCancelRefund({ money: 0, oil: 0, steel: 0, electronics: 0 })).toEqual({
			money: 0,
			oil: 0,
			steel: 0,
			electronics: 0,
		});
	});
});

describe("nodeIsAffordable", () => {
	const balance = { money: 1000, oil: 500, steel: 800, electronics: 200 };

	it("accepts when every component is at or below balance", () => {
		expect(nodeIsAffordable({ money: 500, oil: 200, steel: 100, electronics: 50 }, balance)).toBe(
			true,
		);
		expect(nodeIsAffordable({ money: 1000, oil: 500, steel: 800, electronics: 200 }, balance)).toBe(
			true,
		);
	});

	it("rejects when any single component exceeds balance", () => {
		expect(nodeIsAffordable({ money: 1001, oil: 0, steel: 0, electronics: 0 }, balance)).toBe(
			false,
		);
		expect(nodeIsAffordable({ money: 0, oil: 501, steel: 0, electronics: 0 }, balance)).toBe(false);
		expect(nodeIsAffordable({ money: 0, oil: 0, steel: 801, electronics: 0 }, balance)).toBe(false);
		expect(nodeIsAffordable({ money: 0, oil: 0, steel: 0, electronics: 201 }, balance)).toBe(false);
	});
});

describe("labEconomyBoostFactor", () => {
	it("returns 1.0 with no labs", () => {
		expect(labEconomyBoostFactor(0)).toBe(1);
	});

	it("scales linearly per lab (5%, cap 5)", () => {
		expect(labEconomyBoostFactor(1)).toBeCloseTo(1.05, 4);
		expect(labEconomyBoostFactor(2)).toBeCloseTo(1.1, 4);
		expect(labEconomyBoostFactor(3)).toBeCloseTo(1.15, 4);
		expect(labEconomyBoostFactor(4)).toBeCloseTo(1.2, 4);
		expect(labEconomyBoostFactor(5)).toBeCloseTo(1.25, 4);
	});

	it("caps at stackCap", () => {
		expect(labEconomyBoostFactor(6)).toBeCloseTo(1.25, 4);
		expect(labEconomyBoostFactor(100)).toBeCloseTo(1.25, 4);
	});

	it("clamps negative", () => {
		expect(labEconomyBoostFactor(-1)).toBe(1);
	});
});

describe("countCompletedLabsByPlayer", () => {
	const alice = "00000000-0000-0000-0000-000000000001";
	const bob = "00000000-0000-0000-0000-000000000002";

	it("counts complete research_labs whose host city is still owned by the builder", () => {
		const m = countCompletedLabsByPlayer([
			{ type: "research_lab", state: "complete", builtByPlayerId: alice, ownerPlayerId: alice },
			{ type: "research_lab", state: "complete", builtByPlayerId: alice, ownerPlayerId: alice },
			{ type: "research_lab", state: "complete", builtByPlayerId: bob, ownerPlayerId: bob },
		]);
		expect(m.get(alice)).toBe(2);
		expect(m.get(bob)).toBe(1);
	});

	it("ignores in-progress + cancelled labs", () => {
		const m = countCompletedLabsByPlayer([
			{ type: "research_lab", state: "in_progress", builtByPlayerId: alice, ownerPlayerId: alice },
			{ type: "research_lab", state: "cancelled", builtByPlayerId: alice, ownerPlayerId: alice },
		]);
		expect(m.get(alice)).toBeUndefined();
	});

	it("ignores buildings on defected cities (owner ≠ builder)", () => {
		const m = countCompletedLabsByPlayer([
			{ type: "research_lab", state: "complete", builtByPlayerId: alice, ownerPlayerId: bob },
			{ type: "research_lab", state: "complete", builtByPlayerId: alice, ownerPlayerId: null },
		]);
		expect(m.get(alice)).toBeUndefined();
	});

	it("ignores non-research_lab types", () => {
		const m = countCompletedLabsByPlayer([
			{ type: "steel_industry", state: "complete", builtByPlayerId: alice, ownerPlayerId: alice },
		]);
		expect(m.get(alice)).toBeUndefined();
	});
});

describe("end-to-end discount + affordability", () => {
	// 5 labs (max discount, −50%) makes a 200k research drop to 100k.
	it("5 labs reduce a 200k cost to 100k", () => {
		const discount = labDiscountPct(5);
		expect(discount).toBe(50);
		const cost = { money: 200_000, oil: 0, steel: 0, electronics: 0 };
		const post = applyDiscountToCost(cost, discount);
		expect(post.money).toBe(100_000);
	});

	it("3 labs against an exact-match pool tip into affordability", () => {
		const cost = { money: 100_000, oil: 50_000, steel: 0, electronics: 0 };
		const pool = { money: 70_000, oil: 35_000, steel: 0, electronics: 0 };
		// 0 labs: 100k > 70k → unaffordable
		expect(nodeIsAffordable(applyDiscountToCost(cost, labDiscountPct(0)), pool)).toBe(false);
		// 3 labs: 30% off → 70k money + 35k oil → exactly affordable
		expect(nodeIsAffordable(applyDiscountToCost(cost, labDiscountPct(3)), pool)).toBe(true);
	});
});
