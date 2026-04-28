import { z } from "zod";
import policyJson from "../data/nation-policy.json" with { type: "json" };
import type { SliderName } from "./order-payloads";

/*
 * National-policy constants — Phase 3b/3e.
 *
 * One JSON file feeds both the slider economics (3b) and the unrest deltas
 * that read from the same slider state (3e). Numbers are first-pass and
 * tunable without code edits. All money/electronics units are at the same
 * ×100 scale used elsewhere; "per notch" means per integer step on the 0–100
 * slider.
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
		version: z.literal(1),
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
				healthcareGrowthRefSlider: z.number().int().min(1).max(100),
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
