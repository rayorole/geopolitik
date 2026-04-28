import { z } from "zod";
import { buildingType } from "./buildings-catalog";

/*
 * Order payload schemas — Phase 3.
 *
 * Each `kind` discriminant carries a typed payload. The REST submit-order
 * endpoint Zod-parses against this discriminated union; the tick worker
 * re-parses on drain (server-authoritative belt + suspenders per CLAUDE.md).
 */

export const sliderName = z.enum(["taxation", "welfare", "healthcare", "propaganda"]);
export type SliderName = z.infer<typeof sliderName>;

export const noopOrder = z
	.object({
		kind: z.literal("noop"),
		payload: z.unknown().optional(),
	})
	.strict();

export const buildOrder = z
	.object({
		kind: z.literal("build"),
		payload: z
			.object({
				cityId: z.string().uuid(),
				type: buildingType,
			})
			.strict(),
	})
	.strict();

export const cancelBuildOrder = z
	.object({
		kind: z.literal("cancel_build"),
		payload: z
			.object({
				buildingId: z.string().uuid(),
			})
			.strict(),
	})
	.strict();

export const setSliderOrder = z
	.object({
		kind: z.literal("set_slider"),
		payload: z
			.object({
				slider: sliderName,
				value: z.number().int().min(0).max(100),
			})
			.strict(),
	})
	.strict();

export const submitOrderBodyV3 = z.discriminatedUnion("kind", [
	noopOrder,
	buildOrder,
	cancelBuildOrder,
	setSliderOrder,
]);
export type SubmitOrderBodyV3 = z.infer<typeof submitOrderBodyV3>;
