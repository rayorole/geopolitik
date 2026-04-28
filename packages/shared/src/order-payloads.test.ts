import { describe, expect, it } from "vitest";
import { submitOrderBodyV3 } from "./order-payloads";

describe("submitOrderBodyV3", () => {
	const uuid = "11111111-2222-3333-4444-555555555555";

	it("accepts a valid build order", () => {
		const r = submitOrderBodyV3.safeParse({
			kind: "build",
			payload: { cityId: uuid, type: "steel_industry" },
		});
		expect(r.success).toBe(true);
	});

	it("rejects build with unknown building type", () => {
		const r = submitOrderBodyV3.safeParse({
			kind: "build",
			payload: { cityId: uuid, type: "not_a_building" },
		});
		expect(r.success).toBe(false);
	});

	it("rejects build with non-uuid cityId", () => {
		const r = submitOrderBodyV3.safeParse({
			kind: "build",
			payload: { cityId: "not-a-uuid", type: "steel_industry" },
		});
		expect(r.success).toBe(false);
	});

	it("accepts a valid cancel_build order", () => {
		const r = submitOrderBodyV3.safeParse({
			kind: "cancel_build",
			payload: { buildingId: uuid },
		});
		expect(r.success).toBe(true);
	});

	it("accepts set_slider at the boundary values", () => {
		for (const value of [0, 100]) {
			const r = submitOrderBodyV3.safeParse({
				kind: "set_slider",
				payload: { slider: "taxation", value },
			});
			expect(r.success).toBe(true);
		}
	});

	it("rejects set_slider above 100", () => {
		const r = submitOrderBodyV3.safeParse({
			kind: "set_slider",
			payload: { slider: "taxation", value: 101 },
		});
		expect(r.success).toBe(false);
	});

	it("rejects set_slider with unknown slider", () => {
		const r = submitOrderBodyV3.safeParse({
			kind: "set_slider",
			payload: { slider: "happiness", value: 50 },
		});
		expect(r.success).toBe(false);
	});

	it("rejects unknown order kind", () => {
		const r = submitOrderBodyV3.safeParse({
			kind: "fly_to_moon",
			payload: {},
		});
		expect(r.success).toBe(false);
	});

	it("rejects extra payload keys", () => {
		const r = submitOrderBodyV3.safeParse({
			kind: "build",
			payload: { cityId: uuid, type: "steel_industry", extra: 1 },
		});
		expect(r.success).toBe(false);
	});
});
