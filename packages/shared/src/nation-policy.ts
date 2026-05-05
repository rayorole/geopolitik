import { z } from "zod";
import policyJson from "../data/nation-policy.json" with { type: "json" };
import type { SliderName } from "./order-payloads";

/*
 * National-policy constants.
 *
 * Single source of truth for every tunable economic number — starting
 * balances, per-city production rates, slider economics, population growth,
 * and unrest deltas. Tick math in apps/api reads from this file and never
 * carries its own constants. Edit the JSON to rebalance; no code changes.
 *
 * Unit convention:
 *   - `startingResources` and `cityProduction` are in DISPLAY units
 *     (the number a player sees on the HUD). Tick code multiplies by the
 *     internal RES_SCALE (×100) at the boundary.
 *   - `economic` (slider-driven) is also in display-per-notch terms; the
 *     same RES_SCALE multiplication happens inside applySliderEconomics.
 *   - RP carries no display scale (raw integer everywhere).
 *
 * Same module-load pattern as buildings-catalog: a malformed JSON file fails
 * the boot, not a request.
 */

const sliderRange = z
	.object({
		default: z.number().int().min(0).max(100),
		min: z.literal(0),
		max: z.literal(100),
	})
	.strict();

export const nationPolicy = z
	.object({
		version: z.literal(2),
		startingResources: z
			.object({
				money: z.number().int().nonnegative(),
				oil: z.number().int().nonnegative(),
				steel: z.number().int().nonnegative(),
				electronics: z.number().int().nonnegative(),
				rp: z.number().int().nonnegative(),
			})
			.strict(),
		cityProduction: z
			.object({
				moneyPerPopMillion: z.number().nonnegative(),
				oilPerPopMillion: z.number().nonnegative(),
				steelPerPopMillion: z.number().nonnegative(),
				electronicsPerPopMillion: z.number().nonnegative(),
			})
			.strict(),
		populationGrowth: z
			.object({
				ratePerTickNumerator: z.number().int().nonnegative(),
				ratePerTickDenominator: z.number().int().positive(),
				healthcareRefSlider: z.number().int().min(1).max(100),
			})
			.strict(),
		sliders: z
			.object({
				taxation: sliderRange,
				welfare: sliderRange,
				healthcare: sliderRange,
				propaganda: sliderRange,
			})
			.strict(),
		economic: z
			.object({
				taxationMoneyPerPopMillionPerNotch: z.number().int().nonnegative(),
				welfareMoneyPerPopMillionPerNotch: z.number().int().nonnegative(),
				healthcareMoneyPerPopMillionPerNotch: z.number().int().nonnegative(),
				propagandaMoneyPerNotch: z.number().int().nonnegative(),
				propagandaElectronicsPerNotch: z.number().int().nonnegative(),
			})
			.strict(),
		unrest: z
			.object({
				taxationPerNotchAboveDefault: z.number().int().nonnegative(),
				welfarePerNotchBelowDefault: z.number().int().nonnegative(),
				propagandaPerNotch: z.number().int().nonnegative(),
				defaultsTaxation: z.number().int().min(0).max(100),
				defaultsWelfare: z.number().int().min(0).max(100),
				populationScaleDivisor: z.number().int().positive(),
			})
			.strict(),
	})
	.strict();
export type NationPolicy = z.infer<typeof nationPolicy>;

export const NATION_POLICY: NationPolicy = nationPolicy.parse(policyJson);

export const SLIDER_NAMES = [
	"taxation",
	"welfare",
	"healthcare",
	"propaganda",
] as const satisfies readonly SliderName[];

export function defaultSliderValue(name: SliderName): number {
	return NATION_POLICY.sliders[name].default;
}
