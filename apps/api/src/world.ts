import { schema } from "@geopolitik/db";
import { type WorldDataset, worldDataset } from "@geopolitik/shared/api";
import { BUILDINGS_CATALOG } from "@geopolitik/shared/buildings";
import { FACTIONS_CATALOG, factionId } from "@geopolitik/shared/factions";
import { getAllTreesForFaction } from "@geopolitik/shared/research";
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

	// ── GET /world/buildings ─────────────────────────────────────────────────
	// Static catalog read at module load. No DB hit; HTTP cache one hour.
	// 3b/3d consume this to drive UI affordability + tick math.
	w.get("/world/buildings", (c) => {
		c.header("Cache-Control", "public, max-age=3600");
		return c.json(BUILDINGS_CATALOG);
	});

	// ── GET /world/factions ──────────────────────────────────────────────────
	// Phase 4: returns the 4 equipment-lineage factions plus the full ISO
	// country code → faction mapping. Static; HTTP cache one hour.
	w.get("/world/factions", (c) => {
		c.header("Cache-Control", "public, max-age=3600");
		return c.json(FACTIONS_CATALOG);
	});

	// ── GET /world/research/:faction ─────────────────────────────────────────
	// Phase 4: returns all 7 trees for the given faction. Static; cache hour.
	// 4b's drawer UI reads from here to render the player's faction tree.
	// Returns 404 for unknown faction IDs.
	w.get("/world/research/:faction", (c) => {
		const raw = c.req.param("faction");
		const parsed = factionId.safeParse(raw);
		if (!parsed.success) {
			return c.json({ error: "unknown_faction", faction: raw }, 404);
		}
		const trees = getAllTreesForFaction(parsed.data);
		c.header("Cache-Control", "public, max-age=3600");
		return c.json({ faction: parsed.data, trees });
	});

	return w;
}
