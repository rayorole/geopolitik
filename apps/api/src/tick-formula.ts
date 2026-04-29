/*
 * Pure tick math — no DB, no env, no side effects. Lives in a separate file so
 * it can be unit-tested without booting the env / db modules. The transactional
 * tick worker in `./tick.ts` calls into these.
 */

import { NATION_POLICY } from "@geopolitik/shared/policy";

const UNREST_MIN = 0;
const UNREST_MAX = 100;
const UNREST_REVOLT_THRESHOLD = 100;
export const DEFECTION_TICKS_AT_REVOLT = 1440; // 12 real-world hours at 30s ticks

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

/*
 * Per-city unrest delta — Phase 3e.
 *
 * Inputs are the four nation sliders (city inherits the owner's nation
 * sliders) plus the city's current unrest. Returns:
 *   - the per-attribution-bucket delta for the UI breakdown
 *   - the net delta
 *   - the next-tick unrest, clamped to [0, 100]
 *
 * Population isn't a multiplier here at the city level — every city gets the
 * same per-tick delta from the same sliders. The roadmap mentions a pop scale
 * factor; we hold off until balance feedback indicates we need it. Foreign
 * influence (Phase 7) and event-driven spikes (Phase 8) are zero in 3e and
 * land as additive terms on `extra` later.
 */
export type UnrestAttribution = {
	taxation: number;
	welfare: number;
	propaganda: number;
	extra: number;
};

export function computeUnrestDelta(
	sliders: SliderState,
	currentUnrest: number,
	extra = 0,
): { attribution: UnrestAttribution; net: number; nextUnrest: number } {
	const u = NATION_POLICY.unrest;
	// Above-default taxation pushes unrest up; below default has no effect
	// (taxes below baseline aren't a riot trigger, just a revenue trade-off).
	const taxation =
		Math.max(0, sliders.taxation - u.defaultsTaxation) * u.taxationPerNotchAboveDefault;
	// Below-default welfare pushes unrest up (cuts to safety net).
	const welfare = Math.max(0, u.defaultsWelfare - sliders.welfare) * u.welfarePerNotchBelowDefault;
	// Propaganda is a flat unrest reducer scaled by notch count.
	const propaganda = -sliders.propaganda * u.propagandaPerNotch;

	const attribution: UnrestAttribution = { taxation, welfare, propaganda, extra };
	const net = taxation + welfare + propaganda + extra;
	const next = Math.max(UNREST_MIN, Math.min(UNREST_MAX, currentUnrest + net));
	return { attribution, net, nextUnrest: next };
}

/*
 * Revolt / defection bookkeeping. Pure helper so the tick worker just calls
 * it after writing the new unrest value.
 *
 *   - revolt enters when unrest hits 100 and we weren't already in revolt
 *   - revolt exits when unrest drops below 100 (timer resets)
 *   - defection fires once `currentTick - inRevoltSinceTick >= 1440` ticks
 */
export type RevoltState = {
	nextInRevoltSince: number | null;
	enteredRevolt: boolean;
	exitedRevolt: boolean;
	defected: boolean;
};

export function applyRevoltStateChange(
	nextUnrest: number,
	currentInRevoltSince: number | null,
	currentTick: number,
): RevoltState {
	if (nextUnrest >= UNREST_REVOLT_THRESHOLD) {
		if (currentInRevoltSince === null) {
			return {
				nextInRevoltSince: currentTick,
				enteredRevolt: true,
				exitedRevolt: false,
				defected: false,
			};
		}
		const ticksAtMax = currentTick - currentInRevoltSince;
		if (ticksAtMax >= DEFECTION_TICKS_AT_REVOLT) {
			return {
				nextInRevoltSince: null,
				enteredRevolt: false,
				exitedRevolt: false,
				defected: true,
			};
		}
		return {
			nextInRevoltSince: currentInRevoltSince,
			enteredRevolt: false,
			exitedRevolt: false,
			defected: false,
		};
	}
	// unrest below threshold
	if (currentInRevoltSince !== null) {
		return {
			nextInRevoltSince: null,
			enteredRevolt: false,
			exitedRevolt: true,
			defected: false,
		};
	}
	return {
		nextInRevoltSince: null,
		enteredRevolt: false,
		exitedRevolt: false,
		defected: false,
	};
}
