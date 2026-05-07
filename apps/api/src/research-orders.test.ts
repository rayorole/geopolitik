import { describe, expect, it } from "vitest";
import {
	applyDiscountToCost,
	labDiscountPct,
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
