/*
 * Pure tick math — no DB, no env, no side effects. Lives in a separate file so
 * it can be unit-tested without booting the env / db modules. The transactional
 * tick worker in `./tick.ts` calls into these.
 */

const RES_SCALE = 100; // resources stored as integer × 100
const POP_GROWTH_NUMER = 5;
const POP_GROWTH_DENOM = 10_000; // 0.05% per tick

export type CityProductionInput = {
	population: number;
	moneyMult: number;
	steelMult: number;
	electronicsMult: number;
	oilMult: number;
};

export type ResourceDelta = {
	money: number;
	oil: number;
	steel: number;
	electronics: number;
};

export function growCityPopulation(pop: number): number {
	return pop + Math.floor((pop * POP_GROWTH_NUMER) / POP_GROWTH_DENOM);
}

export function applyProductionToCity(c: CityProductionInput): {
	newPopulation: number;
	resourceDelta: ResourceDelta;
} {
	const popM = c.population / 1_000_000;
	return {
		newPopulation: growCityPopulation(c.population),
		resourceDelta: {
			money: Math.floor(popM * 100 * c.moneyMult * RES_SCALE),
			oil: Math.floor(popM * 5 * c.oilMult * RES_SCALE),
			steel: Math.floor(popM * 5 * c.steelMult * RES_SCALE),
			electronics: Math.floor(popM * 0.2 * c.electronicsMult * RES_SCALE),
		},
	};
}
