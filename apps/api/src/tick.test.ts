import { describe, expect, it } from "vitest";
import { applyProductionToCity, growCityPopulation } from "./tick-formula";

describe("tick — pure production formula", () => {
	it("a 1M-pop city with default multipliers contributes +100/+5/+0.2 (× 100 storage)", () => {
		const result = applyProductionToCity({
			population: 1_000_000,
			moneyMult: 1,
			steelMult: 1,
			electronicsMult: 1,
			oilMult: 0,
		});
		// Display deltas: 100 money, 5 steel, 0.2 electronics, 0 oil
		// Stored × 100: 10_000, 500, 20, 0
		expect(result.resourceDelta.money).toBe(10_000);
		expect(result.resourceDelta.steel).toBe(500);
		expect(result.resourceDelta.electronics).toBe(20);
		expect(result.resourceDelta.oil).toBe(0);
	});

	it("oil multiplier produces nothing when zero, scales linearly otherwise", () => {
		const noOil = applyProductionToCity({
			population: 5_000_000,
			moneyMult: 1,
			steelMult: 1,
			electronicsMult: 1,
			oilMult: 0,
		});
		expect(noOil.resourceDelta.oil).toBe(0);

		const oily = applyProductionToCity({
			population: 5_000_000,
			moneyMult: 1,
			steelMult: 1,
			electronicsMult: 1,
			oilMult: 4, // Riyadh-tier
		});
		// 5 (popM) × 5 (base) × 4 (mult) × 100 (scale) = 10_000
		expect(oily.resourceDelta.oil).toBe(10_000);
	});

	it("multipliers scale all four resources independently", () => {
		const r = applyProductionToCity({
			population: 2_000_000,
			moneyMult: 1.5,
			steelMult: 2.0,
			electronicsMult: 3.0,
			oilMult: 0,
		});
		// money: 2 × 100 × 1.5 × 100 = 30_000
		expect(r.resourceDelta.money).toBe(30_000);
		// steel: 2 × 5 × 2.0 × 100 = 2_000
		expect(r.resourceDelta.steel).toBe(2_000);
		// electronics: 2 × 0.2 × 3.0 × 100 = 120
		expect(r.resourceDelta.electronics).toBe(120);
		expect(r.resourceDelta.oil).toBe(0);
	});

	it("scales linearly with population", () => {
		const small = applyProductionToCity({
			population: 1_000_000,
			moneyMult: 1,
			steelMult: 1,
			electronicsMult: 1,
			oilMult: 0,
		});
		const large = applyProductionToCity({
			population: 10_000_000,
			moneyMult: 1,
			steelMult: 1,
			electronicsMult: 1,
			oilMult: 0,
		});
		expect(large.resourceDelta.money).toBe(small.resourceDelta.money * 10);
		expect(large.resourceDelta.steel).toBe(small.resourceDelta.steel * 10);
	});

	it("floors fractional contributions to keep tick math integer-deterministic", () => {
		// 100k pop × 0.2 electronics base × 1.0 mult × 100 scale = 2000
		// Display delta = 100k / 1M × 0.2 = 0.02 / tick. Stored × 100 = 2.
		const r = applyProductionToCity({
			population: 100_000,
			moneyMult: 1,
			steelMult: 1,
			electronicsMult: 1,
			oilMult: 0,
		});
		expect(r.resourceDelta.electronics).toBe(2);
	});
});

describe("growCityPopulation", () => {
	it("grows by 0.05%/tick (5/10000), rounded down", () => {
		expect(growCityPopulation(1_000_000)).toBe(1_000_500);
		expect(growCityPopulation(2_000_000)).toBe(2_001_000);
	});

	it("is monotonic and idempotent at zero", () => {
		expect(growCityPopulation(0)).toBe(0);
		expect(growCityPopulation(1)).toBe(1); // Math.floor(1 * 5/10000) = 0
		expect(growCityPopulation(2_000)).toBe(2_001); // Math.floor(2000*5/10000)=1
	});

	it("compounds across many ticks above the floor threshold", () => {
		let pop = 1_000_000;
		for (let i = 0; i < 100; i++) pop = growCityPopulation(pop);
		// Approx 1.0005^100 = 1.0512 → ~1.051M; integer floor each tick is close.
		expect(pop).toBeGreaterThan(1_050_000);
		expect(pop).toBeLessThan(1_055_000);
	});
});
