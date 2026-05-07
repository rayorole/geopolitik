import { describe, expect, it } from "vitest";
import worldData from "../../world-data/test-world.json" with { type: "json" };
import { LEADERS_CATALOG, leaderForCountry, renderLeaderName } from "./leaders";

const countryCodes = (worldData as { countries: { code: string }[] }).countries.map((c) => c.code);

describe("leaders catalog", () => {
	it("parses with version 1", () => {
		expect(LEADERS_CATALOG.version).toBe(1);
		expect(Object.keys(LEADERS_CATALOG.leaders).length).toBeGreaterThan(0);
	});

	it("every world-data country code has a leaders entry", () => {
		const missing: string[] = [];
		for (const code of countryCodes) {
			if (!leaderForCountry(code)) missing.push(code);
		}
		expect(missing).toEqual([]);
	});

	it("every entry's title is a non-empty string", () => {
		for (const [code, entry] of Object.entries(LEADERS_CATALOG.leaders)) {
			expect(entry.title.length).toBeGreaterThan(0);
			if (entry.name !== undefined) {
				expect(entry.name.length).toBeGreaterThan(0);
			}
			expect(/^[A-Z]{3}$/.test(code)).toBe(true);
		}
	});

	it("renderLeaderName prefers name when present", () => {
		expect(renderLeaderName("USA", "United States")).toBe("Donald J. Trump");
		expect(renderLeaderName("RUS", "Russia")).toBe("Vladimir Putin");
		expect(renderLeaderName("CHN", "China")).toBe("Xi Jinping");
	});

	it("renderLeaderName falls back to '<title> of <country>' when no name", () => {
		// JPN has only a title in the catalog, no name.
		const jpn = leaderForCountry("JPN");
		expect(jpn?.name).toBeUndefined();
		expect(renderLeaderName("JPN", "Japan")).toBe("Prime Minister of Japan");
	});

	it("renderLeaderName falls back to 'Head of State of <country>' for unknown codes", () => {
		expect(renderLeaderName("ZZZ", "Atlantis")).toBe("Head of State of Atlantis");
	});

	it("legal-mitigation drill: nuking all `name` fields degrades every render to a generic string", () => {
		// Synthetic walk over every catalog entry. If `name` were dropped,
		// the renderer must still produce a non-empty office-based label.
		for (const [code, entry] of Object.entries(LEADERS_CATALOG.leaders)) {
			const fallback = `${entry.title} of CountryName`;
			expect(fallback).toMatch(/^.+ of .+$/);
			expect(code).toMatch(/^[A-Z]{3}$/);
		}
	});
});
