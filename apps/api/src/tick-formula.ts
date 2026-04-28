/*
 * Pure tick math — no DB, no env, no side effects. Lives in a separate file so
 * it can be unit-tested without booting the env / db modules. The transactional
 * tick worker in `./tick.ts` calls into these.
 */

import { NATION_POLICY } from "@geopolitik/shared/policy";

const RES_SCALE = 100; // resources stored as integer × 100
const POP_GROWTH_NUMER = 5;
const POP_GROWTH_DENOM = 10_000; // 0.05% per tick at healthcare = ref (50)
const HEALTHCARE_GROWTH_REF = NATION_POLICY.economic.healthcareGrowthRefSlider;

export type CityProductionInput = {
	population: number;
	moneyMult: number;
	steelMult: number;
	electronicsMult: number;
	oilMult: number;
	healthcare?: number;
};

export type ResourceDelta = {
	money: number;
	oil: number;
	steel: number;
	electronics: number;
};

export type SliderState = {
	taxation: number;
	welfare: number;
	healthcare: number;
	propaganda: number;
};

/*
 * Phase 3b expanded: pop growth scales with healthcare/REF. With healthcare
 * at the reference (50) the rate matches the original 0.05%/tick; halving
 * healthcare halves growth, doubling doubles it.
 */
export function growCityPopulation(pop: number, healthcare = HEALTHCARE_GROWTH_REF): number {
	if (pop <= 0) return 0;
	const numer = POP_GROWTH_NUMER * Math.max(0, healthcare);
	const denom = POP_GROWTH_DENOM * HEALTHCARE_GROWTH_REF;
	return pop + Math.floor((pop * numer) / denom);
}

export function applyProductionToCity(c: CityProductionInput): {
	newPopulation: number;
	resourceDelta: ResourceDelta;
} {
	const popM = c.population / 1_000_000;
	return {
		newPopulation: growCityPopulation(c.population, c.healthcare),
		resourceDelta: {
			money: Math.floor(popM * 100 * c.moneyMult * RES_SCALE),
			oil: Math.floor(popM * 5 * c.oilMult * RES_SCALE),
			steel: Math.floor(popM * 5 * c.steelMult * RES_SCALE),
			electronics: Math.floor(popM * 0.2 * c.electronicsMult * RES_SCALE),
		},
	};
}

/*
 * Slider economics — applied per nation, per tick, on top of city production.
 *
 * Inputs are the four 0–100 slider positions plus the nation's total
 * population (raw int, summed across owned cities). Output is a money +
 * electronics delta at the standard ×100 scale, ready to add to nation_state.
 *
 *   taxation  : revenue scaled by population (more citizens to tax).
 *   welfare   : flat per-capita cost (more citizens to support).
 *   healthcare: per-capita cost (also feeds growCityPopulation via the
 *               healthcare arg — that growth side-effect lives on the city).
 *   propaganda: flat per-tick cost in money + electronics, no pop scale —
 *               the propaganda apparatus itself, not per-citizen messaging.
 */
export function applySliderEconomics(sliders: SliderState, totalPopulation: number): ResourceDelta {
	const popM = Math.max(0, totalPopulation) / 1_000_000;
	const e = NATION_POLICY.economic;

	const taxIn = Math.floor(
		popM * sliders.taxation * e.taxationMoneyPerPopMillionPerNotch * RES_SCALE,
	);
	const welfareOut = Math.floor(
		popM * sliders.welfare * e.welfareMoneyPerPopMillionPerNotch * RES_SCALE,
	);
	const healthOut = Math.floor(
		popM * sliders.healthcare * e.healthcareMoneyPerPopMillionPerNotch * RES_SCALE,
	);
	const propMoneyOut = Math.floor(sliders.propaganda * e.propagandaMoneyPerNotch * RES_SCALE);
	const propElecOut = Math.floor(sliders.propaganda * e.propagandaElectronicsPerNotch * RES_SCALE);

	return {
		money: taxIn - welfareOut - healthOut - propMoneyOut,
		oil: 0,
		steel: 0,
		electronics: -propElecOut,
	};
}
