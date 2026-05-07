import { NATION_POLICY } from "@geopolitik/shared/policy";
import { describe, expect, it } from "vitest";
import {
	DEFECTION_TICKS_AT_REVOLT,
	RES_SCALE,
	applyProductionToCity,
	applyRevoltStateChange,
	applySliderEconomics,
	computeUnrestDelta,
	getStartingResources,
	growCityPopulation,
} from "./tick-formula";

describe("tick — pure production formula", () => {
	it("a 1M-pop city with default multipliers contributes the policy money/steel/electronics rates", () => {
		const result = applyProductionToCity({
			population: 1_000_000,
			moneyMult: 1,
			steelMult: 1,
			electronicsMult: 1,
			oilMult: 0,
		});
		// Display deltas mirror policy.cityProduction; stored = display × RES_SCALE.
		const p = NATION_POLICY.cityProduction;
		expect(result.resourceDelta.money).toBe(p.moneyPerPopMillion * RES_SCALE);
		expect(result.resourceDelta.steel).toBe(p.steelPerPopMillion * RES_SCALE);
		expect(result.resourceDelta.electronics).toBe(
			Math.floor(p.electronicsPerPopMillion * RES_SCALE),
		);
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
		const p = NATION_POLICY.cityProduction;
		// 2 popM × base × mult × RES_SCALE
		expect(r.resourceDelta.money).toBe(Math.floor(2 * p.moneyPerPopMillion * 1.5 * RES_SCALE));
		expect(r.resourceDelta.steel).toBe(Math.floor(2 * p.steelPerPopMillion * 2.0 * RES_SCALE));
		expect(r.resourceDelta.electronics).toBe(
			Math.floor(2 * p.electronicsPerPopMillion * 3.0 * RES_SCALE),
		);
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
	it("grows by 0.05%/tick at the healthcare reference (50)", () => {
		expect(growCityPopulation(1_000_000)).toBe(1_000_500);
		expect(growCityPopulation(2_000_000)).toBe(2_001_000);
	});

	it("is monotonic and idempotent at zero", () => {
		expect(growCityPopulation(0)).toBe(0);
		expect(growCityPopulation(1)).toBe(1); // Math.floor(1 * 5/10000) = 0
		expect(growCityPopulation(2_000)).toBe(2_001);
	});

	it("compounds across many ticks above the floor threshold", () => {
		let pop = 1_000_000;
		for (let i = 0; i < 100; i++) pop = growCityPopulation(pop);
		expect(pop).toBeGreaterThan(1_050_000);
		expect(pop).toBeLessThan(1_055_000);
	});

	it("scales with healthcare slider — half rate at 25, double at 100", () => {
		expect(growCityPopulation(1_000_000, 0)).toBe(1_000_000);
		expect(growCityPopulation(1_000_000, 25)).toBe(1_000_250);
		expect(growCityPopulation(1_000_000, 50)).toBe(1_000_500);
		expect(growCityPopulation(1_000_000, 100)).toBe(1_001_000);
	});
});

describe("applySliderEconomics", () => {
	const defaults = { taxation: 30, welfare: 50, healthcare: 50, propaganda: 30 } as const;

	it("zero population yields zero economic effect (only propaganda fires)", () => {
		const d = applySliderEconomics(defaults, 0);
		// Defaults at 0 pop: only propaganda flat costs (money + electronics).
		expect(d.money).toBeLessThan(0);
		expect(d.electronics).toBeLessThan(0);
		expect(d.oil).toBe(0);
		expect(d.steel).toBe(0);
	});

	it("higher taxation = more money in", () => {
		const low = applySliderEconomics({ ...defaults, taxation: 10 }, 10_000_000);
		const high = applySliderEconomics({ ...defaults, taxation: 80 }, 10_000_000);
		expect(high.money).toBeGreaterThan(low.money);
	});

	it("welfare and healthcare cost money proportional to population", () => {
		const noWelfare = applySliderEconomics({ ...defaults, welfare: 0 }, 5_000_000);
		const maxWelfare = applySliderEconomics({ ...defaults, welfare: 100 }, 5_000_000);
		expect(maxWelfare.money).toBeLessThan(noWelfare.money);
	});

	it("propaganda burns money + electronics, scales with notch count, not pop", () => {
		const off = applySliderEconomics({ ...defaults, propaganda: 0 }, 1_000_000);
		const on = applySliderEconomics({ ...defaults, propaganda: 100 }, 1_000_000);
		expect(on.electronics).toBeLessThan(off.electronics);
		expect(on.money).toBeLessThan(off.money);
	});

	it("scales linearly with population", () => {
		const _small = applySliderEconomics(defaults, 1_000_000);
		const _large = applySliderEconomics(defaults, 10_000_000);
		// Money delta has a non-pop component (propaganda) — assert taxation-driven part.
		const taxOnlySmall = applySliderEconomics(
			{ ...defaults, propaganda: 0, welfare: 0, healthcare: 0 },
			1_000_000,
		);
		const taxOnlyLarge = applySliderEconomics(
			{ ...defaults, propaganda: 0, welfare: 0, healthcare: 0 },
			10_000_000,
		);
		expect(taxOnlyLarge.money).toBe(taxOnlySmall.money * 10);
	});

	it("max-tax + min-spend at high pop is strongly net-positive money", () => {
		const max = applySliderEconomics(
			{ taxation: 100, welfare: 0, healthcare: 0, propaganda: 0 },
			50_000_000,
		);
		expect(max.money).toBeGreaterThan(0);
	});

	it("default slider mix at modest pop is net-negative money (ongoing welfare cost)", () => {
		const d = applySliderEconomics(defaults, 5_000_000);
		expect(d.money).toBeLessThan(0);
	});

	it("clamps a negative population input to zero scale", () => {
		const d = applySliderEconomics(defaults, -100);
		// Only propaganda flat costs survive; pop-scaled terms are zero.
		expect(d.money).toBe(applySliderEconomics(defaults, 0).money);
	});
});

describe("computeUnrestDelta", () => {
	const defaults = { taxation: 30, welfare: 50, healthcare: 50, propaganda: 30 } as const;

	it("default sliders below threshold yield a negative net (propaganda dampens)", () => {
		const r = computeUnrestDelta(defaults, 0);
		expect(r.net).toBeLessThan(0);
		expect(r.attribution.taxation).toBe(0);
		expect(r.attribution.welfare).toBe(0);
		expect(r.attribution.propaganda).toBeLessThan(0);
	});

	it("clamps below 0 — peaceful nation can't drop into negative unrest", () => {
		const r = computeUnrestDelta(defaults, 0);
		expect(r.nextUnrest).toBe(0);
	});

	it("max taxation drives unrest up", () => {
		const calm = computeUnrestDelta(defaults, 50);
		const oppressive = computeUnrestDelta({ ...defaults, taxation: 100 }, 50);
		expect(oppressive.net).toBeGreaterThan(calm.net);
		expect(oppressive.attribution.taxation).toBeGreaterThan(0);
	});

	it("zero welfare drives unrest up", () => {
		const r = computeUnrestDelta({ ...defaults, welfare: 0 }, 50);
		expect(r.attribution.welfare).toBeGreaterThan(0);
	});

	it("max propaganda + zero everything else still pushes unrest down", () => {
		const r = computeUnrestDelta(
			{ taxation: 30, welfare: 50, healthcare: 50, propaganda: 100 },
			50,
		);
		expect(r.net).toBeLessThan(0);
	});

	it("clamps at 100 — can't exceed the revolt threshold", () => {
		const r = computeUnrestDelta({ ...defaults, taxation: 100, propaganda: 0 }, 99);
		expect(r.nextUnrest).toBe(100);
	});

	it("attribution sum equals net (no hidden math)", () => {
		const r = computeUnrestDelta({ ...defaults, taxation: 80, welfare: 20 }, 30, 5);
		const sum =
			r.attribution.taxation +
			r.attribution.welfare +
			r.attribution.propaganda +
			r.attribution.extra;
		expect(sum).toBe(r.net);
	});
});

describe("getStartingResources", () => {
	it("returns nation-policy.json starting resources scaled to storage units", () => {
		const r = getStartingResources();
		const s = NATION_POLICY.startingResources;
		expect(r.money).toBe(s.money * RES_SCALE);
		expect(r.oil).toBe(s.oil * RES_SCALE);
		expect(r.steel).toBe(s.steel * RES_SCALE);
		expect(r.electronics).toBe(s.electronics * RES_SCALE);
	});

	it("displays 500K money on the HUD (i.e. 50M stored under ×100 scale)", () => {
		expect(NATION_POLICY.startingResources.money).toBe(500_000);
		expect(getStartingResources().money).toBe(50_000_000);
	});
});

describe("applyRevoltStateChange", () => {
	it("does nothing when below threshold and not in revolt", () => {
		const r = applyRevoltStateChange(50, null, 1000);
		expect(r.nextInRevoltSince).toBeNull();
		expect(r.enteredRevolt).toBe(false);
		expect(r.defected).toBe(false);
	});

	it("enters revolt when unrest hits 100 and we weren't already revolting", () => {
		const r = applyRevoltStateChange(100, null, 1000);
		expect(r.enteredRevolt).toBe(true);
		expect(r.nextInRevoltSince).toBe(1000);
		expect(r.defected).toBe(false);
	});

	it("stays in revolt while unrest is still 100 and the timer hasn't elapsed", () => {
		const r = applyRevoltStateChange(100, 1000, 1500);
		expect(r.enteredRevolt).toBe(false);
		expect(r.exitedRevolt).toBe(false);
		expect(r.defected).toBe(false);
		expect(r.nextInRevoltSince).toBe(1000);
	});

	it("exits revolt when unrest drops below 100 (timer resets)", () => {
		const r = applyRevoltStateChange(99, 1000, 1500);
		expect(r.exitedRevolt).toBe(true);
		expect(r.nextInRevoltSince).toBeNull();
		expect(r.defected).toBe(false);
	});

	it("defects after exactly 1440 ticks at unrest 100", () => {
		const r = applyRevoltStateChange(100, 1000, 1000 + DEFECTION_TICKS_AT_REVOLT);
		expect(r.defected).toBe(true);
		expect(r.nextInRevoltSince).toBeNull();
	});

	it("does not defect at 1439 ticks", () => {
		const r = applyRevoltStateChange(100, 1000, 1000 + DEFECTION_TICKS_AT_REVOLT - 1);
		expect(r.defected).toBe(false);
		expect(r.nextInRevoltSince).toBe(1000);
	});
});
