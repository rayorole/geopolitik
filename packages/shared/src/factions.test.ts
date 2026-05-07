import { describe, expect, it } from "vitest";
import worldData from "../../world-data/test-world.json" with { type: "json" };
import {
	FACTIONS_CATALOG,
	FACTION_IDS,
	factionForCountry,
	factionForCountryOrThrow,
} from "./factions";

const countryCodes = (worldData as { countries: { code: string }[] }).countries.map((c) => c.code);

describe("factions catalog", () => {
	it("declares exactly 4 factions", () => {
		expect(Object.keys(FACTIONS_CATALOG.factions).sort()).toEqual([
			"china",
			"nato_eu",
			"russia",
			"us",
		]);
	});

	it("FACTION_IDS matches the catalog keys", () => {
		expect(FACTION_IDS).toHaveLength(4);
		for (const id of FACTION_IDS) {
			expect(FACTIONS_CATALOG.factions[id]).toBeDefined();
		}
	});

	it("every faction has displayName, shortName, description", () => {
		for (const id of FACTION_IDS) {
			const f = FACTIONS_CATALOG.factions[id];
			expect(f.displayName.length).toBeGreaterThan(0);
			expect(f.shortName.length).toBeGreaterThan(0);
			expect(f.description.length).toBeGreaterThan(0);
		}
	});

	it("every world-data country code maps to a known faction", () => {
		const unmapped: string[] = [];
		for (const code of countryCodes) {
			const f = factionForCountry(code);
			if (!f) unmapped.push(code);
		}
		expect(unmapped).toEqual([]);
	});

	it("factionForCountryOrThrow throws on unknown code", () => {
		expect(() => factionForCountryOrThrow("ZZZ")).toThrow();
	});

	it("known assignments per the locked grilling decisions", () => {
		// Decisions explicitly called out by the user during grilling.
		expect(factionForCountry("USA")).toBe("us");
		expect(factionForCountry("ITA")).toBe("nato_eu");
		expect(factionForCountry("PRK")).toBe("china");
		expect(factionForCountry("RUS")).toBe("russia");
	});
});
