import { schema } from "@geopolitik/db";
import { type WorldDataset, worldDataset } from "@geopolitik/shared/api";
import { Hono } from "hono";
import { db } from "./db";

export function createWorldRouter() {
	const w = new Hono();

	// ── GET /world/cities ────────────────────────────────────────────────────
	// Static-ish dataset; HTTP cache one hour. Phase 1 worldgen replaces the
	// underlying rows but the response shape is stable.
	w.get("/world/cities", async (c) => {
		const countries = await db
			.select({ code: schema.country.code, name: schema.country.name })
			.from(schema.country);
		const cities = await db
			.select({
				id: schema.city.id,
				countryCode: schema.city.countryCode,
				name: schema.city.name,
				lat: schema.city.lat,
				lng: schema.city.lng,
				basePopulation: schema.city.basePopulation,
				isCapital: schema.city.isCapital,
				moneyMult: schema.city.moneyMult,
				steelMult: schema.city.steelMult,
				electronicsMult: schema.city.electronicsMult,
				oilMult: schema.city.oilMult,
			})
			.from(schema.city);
		const dataset: WorldDataset = { countries, cities };
		c.header("Cache-Control", "public, max-age=3600");
		return c.json(worldDataset.parse(dataset));
	});

	return w;
}
