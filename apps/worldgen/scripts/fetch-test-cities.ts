/*
 * fetch-test-cities.ts — fixture v2 generator.
 *
 * Reproducible curation rule:
 *   1. Fetch GeoNames `countryInfo.txt` and `cities500.zip`.
 *   2. Eligibility: 3-letter ISO + (population >= 250k OR area >= 30k km^2).
 *   3. Bucket by area:
 *        - playable     (area >= 50k km^2): pop-thirds -> 12 / 10 / 8 cities
 *        - decoration   (area <  50k km^2): pop-thirds -> 6 / 4 / 3 cities
 *      Decoration countries are unplayable (joinable=false in game schema)
 *      but render on the map as terrain.
 *   4. For each country, take top-N cities by population from cities500
 *      (capital first).
 *   5. Merge per-city multipliers from `packages/world-data/city-bonuses.json`.
 *   6. Write `packages/world-data/test-world.json` and a Drizzle seed
 *      migration `packages/db/drizzle/0008_world_v2_seed.sql` that wipes
 *      country/city (CASCADE) before inserting the v2 fixture.
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

// Eligibility — country shows up at all if either threshold is met.
const MIN_COUNTRY_POPULATION = 250_000;
const MIN_COUNTRY_AREA_KM2 = 30_000;

// Playability — country is joinable as a player nation.
const MIN_PLAYABLE_AREA_KM2 = 50_000;

// Defunct / uninhabited / phantom ISO3 codes that GeoNames still tracks
// but shouldn't appear in the fixture. Drop unconditionally.
const DENYLIST_ISO3 = new Set([
	"SCG", // Serbia and Montenegro — dissolved 2006
	"ANT", // Netherlands Antilles — dissolved 2010
	"ATA", // Antarctica — no civilian population
	"BVT", // Bouvet Island — uninhabited
	"HMD", // Heard Island and McDonald Islands — uninhabited
	"ATF", // French Southern Territories — research stations only
	"IOT", // British Indian Ocean Territory
	"UMI", // U.S. Minor Outlying Islands
	"CXR", // Christmas Island
	"CCK", // Cocos (Keeling) Islands
	"NFK", // Norfolk Island
	"PCN", // Pitcairn Islands
	"SHN", // Saint Helena, Ascension, Tristan da Cunha
]);

// Per-bucket city counts: top / mid / bottom population thirds within bucket.
const PLAYABLE_TIER = { top: 12, mid: 10, low: 8 } as const;
const DECORATION_TIER = { top: 6, mid: 4, low: 3 } as const;

const OUT_JSON = join(REPO_ROOT, "packages", "world-data", "test-world.json");
const OUT_SQL = join(REPO_ROOT, "packages", "db", "drizzle", "0008_world_v2_seed.sql");
const BONUSES_PATH = join(REPO_ROOT, "packages", "world-data", "city-bonuses.json");

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

// ── 1. Country info (ISO3, name, population, area) ──────────────────────────

type CountryInfo = {
	iso3: string;
	iso2: string;
	name: string;
	population: number;
	areaKm2: number;
};

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
		const areaStr = cols[6];
		const popStr = cols[7];
		if (!iso2 || !iso3 || !name || !popStr) continue;
		const population = Number.parseInt(popStr, 10);
		const areaKm2 = Number.parseInt(areaStr ?? "", 10);
		if (!Number.isFinite(population)) continue;
		// Area can be missing/zero for a few weird territories — keep them at 0
		// and they'll fall out of the eligibility filter below.
		countries.push({
			iso2,
			iso3,
			name,
			population,
			areaKm2: Number.isFinite(areaKm2) ? areaKm2 : 0,
		});
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

function isPlayable(c: CountryInfo): boolean {
	return c.areaKm2 >= MIN_PLAYABLE_AREA_KM2;
}

/*
 * Population-third tier within a country's bucket. `rank` is the country's
 * position (0-indexed) within the population-sorted bucket; `total` is the
 * bucket size.
 */
function tierLimit(rank: number, total: number, playable: boolean): number {
	const t = playable ? PLAYABLE_TIER : DECORATION_TIER;
	if (rank < total / 3) return t.top;
	if (rank < (total * 2) / 3) return t.mid;
	return t.low;
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
		"-- World v2: wipe and reload. CASCADE drops dependent city_state /",
		"-- player / nation_state rows for any in-progress dev games — these",
		"-- are pre-alpha throwaway data. Production deploys ship a clean DB.",
		'TRUNCATE TABLE "city_state", "player", "city", "country" RESTART IDENTITY CASCADE;',
		"",
	];
	for (const c of world.countries) {
		lines.push(
			`INSERT INTO "country" ("code", "name", "area_km2", "is_playable") VALUES ('${sqlEscape(c.code)}', '${sqlEscape(c.name)}', ${c.areaKm2}, ${c.isPlayable});`,
		);
	}
	lines.push("");
	for (const c of world.cities) {
		lines.push(
			`INSERT INTO "city" ("id", "country_code", "name", "lat", "lng", "base_population", "is_capital", "money_mult", "steel_mult", "electronics_mult", "oil_mult") VALUES ('${c.id}', '${sqlEscape(c.countryCode)}', '${sqlEscape(c.name)}', ${c.lat}, ${c.lng}, ${c.basePopulation}, ${c.isCapital}, ${c.moneyMult}, ${c.steelMult}, ${c.electronicsMult}, ${c.oilMult});`,
		);
	}
	lines.push("");
	return lines.join("\n");
}

// ── 5. Main ─────────────────────────────────────────────────────────────────

async function main() {
	const allCountries = await loadCountries();
	console.log(`[country-info] ${allCountries.length} territories loaded`);

	// Eligibility: 3-letter ISO + not denylisted + (pop >= MIN_POP OR area >= MIN_AREA).
	const eligible = allCountries.filter(
		(c) =>
			c.iso3.length === 3 &&
			!DENYLIST_ISO3.has(c.iso3) &&
			(c.population >= MIN_COUNTRY_POPULATION || c.areaKm2 >= MIN_COUNTRY_AREA_KM2),
	);
	console.log(
		`[curate] ${eligible.length} countries (pop>=${MIN_COUNTRY_POPULATION} OR area>=${MIN_COUNTRY_AREA_KM2}km^2)`,
	);

	// Bucket by playability — pop-thirds tier is computed within each bucket.
	const playable = eligible.filter(isPlayable).sort((a, b) => b.population - a.population);
	const decoration = eligible
		.filter((c) => !isPlayable(c))
		.sort((a, b) => b.population - a.population);
	console.log(`[bucket] playable=${playable.length}, decoration=${decoration.length}`);

	const targetIso2 = new Set(eligible.map((c) => c.iso2));
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

	const processBucket = (bucket: CountryInfo[], playableBucket: boolean) => {
		bucket.forEach((country, idx) => {
			const limit = tierLimit(idx, bucket.length, playableBucket);
			const raw = cityMap.get(country.iso2) ?? [];
			const top = pickCitiesFor(country, raw, limit);

			// Skip countries with no eligible cities — leaves a country polygon
			// with no dots, which is uglier than just dropping the entry.
			if (top.length === 0) {
				console.warn(`[skip] ${country.name} (${country.iso3}) — no cities500 entries`);
				return;
			}

			countryRows.push({
				code: country.iso3,
				name: country.name,
				population: country.population,
				areaKm2: country.areaKm2,
				isPlayable: playableBucket,
			});

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
	};

	processBucket(playable, true);
	processBucket(decoration, false);

	// Sort outputs deterministically (by code, then by name) so reruns produce
	// stable diffs except for fresh UUIDs.
	countryRows.sort((a, b) => a.code.localeCompare(b.code));
	cityRows.sort((a, b) => {
		const c = a.countryCode.localeCompare(b.countryCode);
		return c !== 0 ? c : a.name.localeCompare(b.name);
	});

	const world: TestWorld = {
		version: 2,
		generatedAt: new Date().toISOString(),
		source: "GeoNames cities500 + countryInfo (CC-BY 4.0)",
		countries: countryRows,
		cities: cityRows,
	};

	await writeFile(OUT_JSON, `${JSON.stringify(world, null, "\t")}\n`);
	await writeFile(OUT_SQL, emitSql(world));

	const playableCount = countryRows.filter((c) => c.isPlayable).length;
	console.log(
		`[done] ${countryRows.length} countries (${playableCount} playable, ${countryRows.length - playableCount} decoration), ${cityRows.length} cities`,
	);
	console.log(`        -> ${OUT_JSON}`);
	console.log(`        -> ${OUT_SQL}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
