/*
 * fetch-test-cities.ts — Phase 2 test world generator.
 *
 * Reproducible curation rule:
 *   1. Fetch GeoNames `countryInfo.txt` and `cities500.zip`.
 *   2. Filter countries to those with population >= 1M and a 3-letter ISO code.
 *   3. Take the top 75 by population.
 *   4. Sort the chosen 75 by population, split into thirds:
 *      top 25 -> 12 cities each, mid 25 -> 10, bottom 25 -> 8.
 *   5. For each, take top-N cities by population from cities500 (capital first).
 *   6. Merge per-city multipliers from `packages/world-data/city-bonuses.json`.
 *   7. Write `packages/world-data/test-world.json` and a Drizzle seed
 *      migration `packages/db/drizzle/0002_test_world_seed.sql`.
 *
 * Run:    bun run apps/worldgen/scripts/fetch-test-cities.ts
 * Output: deterministic given the same GeoNames snapshot.
 */

import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type CityBonuses,
	type CityRow,
	type CountryRow,
	type TestWorld,
	cityBonusesSchema,
} from "@geopolitik/world-data";
import unzipper from "unzipper";
import { v7 as uuidv7 } from "uuid";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const CACHE_DIR = join(import.meta.dir, "..", ".cache");
const COUNTRY_INFO_URL = "https://download.geonames.org/export/dump/countryInfo.txt";
const CITIES_ZIP_URL = "https://download.geonames.org/export/dump/cities500.zip";
const CITIES_TXT_NAME = "cities500.txt";

const TARGET_COUNTRIES = 75;
const MIN_COUNTRY_POPULATION = 1_000_000;
const CITIES_TIER_TOP = 12;
const CITIES_TIER_MID = 10;
const CITIES_TIER_LOW = 8;

const OUT_JSON = join(REPO_ROOT, "packages", "world-data", "test-world.json");
const OUT_SQL = join(REPO_ROOT, "packages", "db", "drizzle", "0002_test_world_seed.sql");
const BONUSES_PATH = join(REPO_ROOT, "packages", "world-data", "city-bonuses.json");

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

// ── 1. Country info (ISO3, name, population) ────────────────────────────────

type CountryInfo = { iso3: string; iso2: string; name: string; population: number };

async function fetchCached(url: string, cacheName: string): Promise<Buffer> {
	const cachePath = join(CACHE_DIR, cacheName);
	if (existsSync(cachePath)) {
		console.log(`[cache] ${cacheName}`);
		return await readFile(cachePath);
	}
	console.log(`[fetch] ${url}`);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	await writeFile(cachePath, buf);
	return buf;
}

async function loadCountries(): Promise<CountryInfo[]> {
	const buf = await fetchCached(COUNTRY_INFO_URL, "countryInfo.txt");
	const lines = buf.toString("utf8").split("\n");
	const countries: CountryInfo[] = [];
	for (const line of lines) {
		if (!line || line.startsWith("#")) continue;
		const cols = line.split("\t");
		// Columns: ISO, ISO3, ISO-Numeric, fips, Country, Capital, Area, Population, ...
		const iso2 = cols[0];
		const iso3 = cols[1];
		const name = cols[4];
		const popStr = cols[7];
		if (!iso2 || !iso3 || !name || !popStr) continue;
		const population = Number.parseInt(popStr, 10);
		if (!Number.isFinite(population)) continue;
		countries.push({ iso2, iso3, name, population });
	}
	return countries;
}

// ── 2. Cities (top N per country, capital first) ────────────────────────────

type RawCity = {
	id: number;
	name: string;
	asciiName: string;
	lat: number;
	lng: number;
	countryIso2: string;
	featureCode: string;
	population: number;
};

async function loadCitiesByIso2(targetIso2: Set<string>): Promise<Map<string, RawCity[]>> {
	const buf = await fetchCached(CITIES_ZIP_URL, "cities500.zip");
	const directory = await unzipper.Open.buffer(buf);
	const file = directory.files.find((f) => f.path === CITIES_TXT_NAME);
	if (!file) throw new Error(`${CITIES_TXT_NAME} not found in zip`);
	const txt = (await file.buffer()).toString("utf8");

	const byIso2 = new Map<string, RawCity[]>();
	for (const iso2 of targetIso2) byIso2.set(iso2, []);

	for (const line of txt.split("\n")) {
		if (!line) continue;
		const cols = line.split("\t");
		// Columns: geonameid, name, asciiname, alt, lat, lng, fclass, fcode,
		// country, cc2, admin1, admin2, admin3, admin4, population, elev, dem, tz, mod
		const iso2 = cols[8];
		if (!iso2 || !targetIso2.has(iso2)) continue;
		const id = Number.parseInt(cols[0] ?? "", 10);
		const name = cols[1] ?? "";
		const asciiName = cols[2] ?? "";
		const lat = Number.parseFloat(cols[4] ?? "");
		const lng = Number.parseFloat(cols[5] ?? "");
		const featureCode = cols[7] ?? "";
		const population = Number.parseInt(cols[14] ?? "", 10);
		if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		if (!Number.isFinite(population)) continue;
		byIso2
			.get(iso2)
			?.push({ id, name, asciiName, lat, lng, countryIso2: iso2, featureCode, population });
	}
	return byIso2;
}

// ── 3. Curation ─────────────────────────────────────────────────────────────

function pickCitiesFor(country: CountryInfo, raw: RawCity[], limit: number): RawCity[] {
	const sorted = [...raw].sort((a, b) => b.population - a.population);
	const capitals = sorted.filter((c) => c.featureCode === "PPLC");
	const others = sorted.filter((c) => c.featureCode !== "PPLC");
	const picked: RawCity[] = [];
	if (capitals[0]) picked.push(capitals[0]);
	for (const c of others) {
		if (picked.length >= limit) break;
		picked.push(c);
	}
	if (picked.length < limit) {
		console.warn(`[warn] ${country.name} (${country.iso3}) only ${picked.length}/${limit} cities`);
	}
	return picked;
}

function tierLimit(rank: number, total: number): number {
	if (rank < total / 3) return CITIES_TIER_TOP;
	if (rank < (total * 2) / 3) return CITIES_TIER_MID;
	return CITIES_TIER_LOW;
}

// ── 4. SQL emission ─────────────────────────────────────────────────────────

function sqlEscape(s: string): string {
	return s.replace(/'/g, "''");
}

function emitSql(world: TestWorld): string {
	const lines: string[] = [
		"-- Auto-generated by apps/worldgen/scripts/fetch-test-cities.ts",
		`-- Source: ${world.source}`,
		`-- Generated: ${world.generatedAt}`,
		`-- Countries: ${world.countries.length}, Cities: ${world.cities.length}`,
		"",
	];
	for (const c of world.countries) {
		lines.push(
			`INSERT INTO "country" ("code", "name") VALUES ('${sqlEscape(c.code)}', '${sqlEscape(c.name)}') ON CONFLICT ("code") DO NOTHING;`,
		);
	}
	lines.push("");
	for (const c of world.cities) {
		lines.push(
			`INSERT INTO "city" ("id", "country_code", "name", "lat", "lng", "base_population", "is_capital", "money_mult", "steel_mult", "electronics_mult", "oil_mult") VALUES ('${c.id}', '${sqlEscape(c.countryCode)}', '${sqlEscape(c.name)}', ${c.lat}, ${c.lng}, ${c.basePopulation}, ${c.isCapital}, ${c.moneyMult}, ${c.steelMult}, ${c.electronicsMult}, ${c.oilMult}) ON CONFLICT ("id") DO NOTHING;`,
		);
	}
	lines.push("");
	return lines.join("\n");
}

// ── 5. Main ─────────────────────────────────────────────────────────────────

async function main() {
	const allCountries = await loadCountries();
	console.log(`[country-info] ${allCountries.length} territories loaded`);

	const eligible = allCountries
		.filter((c) => c.iso3.length === 3 && c.population >= MIN_COUNTRY_POPULATION)
		.sort((a, b) => b.population - a.population);
	const picked = eligible.slice(0, TARGET_COUNTRIES);
	console.log(`[curate] ${picked.length} countries (>=${MIN_COUNTRY_POPULATION} pop)`);

	const targetIso2 = new Set(picked.map((c) => c.iso2));
	const cityMap = await loadCitiesByIso2(targetIso2);
	console.log("[cities] dataset loaded");

	let bonuses: CityBonuses = {};
	if (existsSync(BONUSES_PATH)) {
		const raw = JSON.parse(await readFile(BONUSES_PATH, "utf8"));
		bonuses = cityBonusesSchema.parse(raw);
		console.log(`[bonuses] ${Object.keys(bonuses).length} city overrides`);
	}

	const countryRows: CountryRow[] = [];
	const cityRows: CityRow[] = [];

	picked.forEach((country, idx) => {
		const limit = tierLimit(idx, picked.length);
		const raw = cityMap.get(country.iso2) ?? [];
		const top = pickCitiesFor(country, raw, limit);

		countryRows.push({ code: country.iso3, name: country.name, population: country.population });

		for (const c of top) {
			const bonusKey = `${country.iso3}:${c.asciiName || c.name}`;
			const b = bonuses[bonusKey] ?? {};
			cityRows.push({
				id: uuidv7(),
				countryCode: country.iso3,
				name: c.name,
				lat: c.lat,
				lng: c.lng,
				basePopulation: c.population,
				isCapital: c.featureCode === "PPLC",
				moneyMult: b.moneyMult ?? 1.0,
				steelMult: b.steelMult ?? 1.0,
				electronicsMult: b.electronicsMult ?? 1.0,
				oilMult: b.oilMult ?? 0.0,
			});
		}
	});

	// Sort outputs deterministically (by code, then by name) so reruns produce
	// stable diffs except for fresh UUIDs.
	countryRows.sort((a, b) => a.code.localeCompare(b.code));
	cityRows.sort((a, b) => {
		const c = a.countryCode.localeCompare(b.countryCode);
		return c !== 0 ? c : a.name.localeCompare(b.name);
	});

	const world: TestWorld = {
		version: 1,
		generatedAt: new Date().toISOString(),
		source: "GeoNames cities500 + countryInfo (CC-BY 4.0)",
		countries: countryRows,
		cities: cityRows,
	};

	await writeFile(OUT_JSON, `${JSON.stringify(world, null, "\t")}\n`);
	await writeFile(OUT_SQL, emitSql(world));

	console.log(`[done] ${countryRows.length} countries, ${cityRows.length} cities`);
	console.log(`        -> ${OUT_JSON}`);
	console.log(`        -> ${OUT_SQL}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
