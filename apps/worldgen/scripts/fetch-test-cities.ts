/*
 * fetch-test-cities.ts — fixture v2 generator.
 *
 * Reproducible curation rule:
 *   1. Fetch GeoNames `countryInfo.txt` and `cities500.zip` and
 *      Natural Earth `ne_50m_coastline.geojson`.
 *   2. Eligibility: 3-letter ISO + (population >= 250k OR area >= 30k km^2).
 *   3. Bucket by area:
 *        - playable     (area >= 50k km^2): pop-thirds -> 12 / 10 / 8 cities
 *        - decoration   (area <  50k km^2): pop-thirds -> 6 / 4 / 3 cities
 *      Decoration countries are unplayable (joinable=false in game schema)
 *      but render on the map as terrain.
 *   4. For each country: drop GeoNames PPLX (city subdivisions); apply the
 *      capital + largest-non-capital anchors then greedy-by-pop with a
 *      country-area-aware min-distance veto. See pickCitiesFor().
 *   5. Mark each country as landlocked (no naval access) using the hardcoded
 *      LANDLOCKED set — Caspian-only countries are landlocked for our rules.
 *   6. Mark each city as coastal if its country is NOT landlocked AND
 *      (distance-to-coastline <= 10 km OR `${ISO3}:${asciiName}` is in
 *      `port-overrides.json`).
 *   7. Merge per-city multipliers from `packages/world-data/city-bonuses.json`.
 *   8. Write `packages/world-data/test-world.json` and a Drizzle seed
 *      migration `packages/db/drizzle/0010_world_v2_seed.sql` that wipes
 *      country/city (CASCADE) before inserting the v2 fixture.
 *
 * Run:    bun run apps/worldgen/scripts/fetch-test-cities.ts
 * Output: deterministic given the same GeoNames + NE snapshots.
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
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

/*
 * Deterministic UUID namespace for the v2 fixture. Generated once via
 * `uuidv7()` and frozen here so subsequent fetch-test-cities runs produce
 * byte-identical output given the same upstream snapshots — no UUID churn
 * on regeneration, no DB-wipe-required diffs, no migration hash drift.
 *
 * If you ever need to invalidate every city ID in the fixture (e.g., after
 * a structural rewrite of the curation rules), generate a new namespace
 * UUID and replace this constant. Otherwise: leave it alone.
 */
const FIXTURE_UUID_NAMESPACE = "8b3f5c12-9d2a-7e0b-bc4d-1a9e3f5d2c10";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const CACHE_DIR = join(import.meta.dir, "..", ".cache");
const COUNTRY_INFO_URL = "https://download.geonames.org/export/dump/countryInfo.txt";
const CITIES_ZIP_URL = "https://download.geonames.org/export/dump/cities500.zip";
const CITIES_TXT_NAME = "cities500.txt";
// Pre-converted Natural Earth GeoJSON — naciscdn ships shapefiles only.
const COASTLINE_GEOJSON_URL =
	"https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/physical/ne_50m_coastline.json";

// Coastal city threshold — any city within this many km of the open-ocean
// coastline polyline counts as `isCoastal`. River-port cities further inland
// (Antwerp on the Scheldt, Hamburg on the Elbe, etc.) are flagged via the
// curated `port-overrides.json` whitelist instead — see Q4 in ROADMAP grilling.
const COASTAL_DISTANCE_KM = 10;

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

// Landlocked = no naval access. Includes "Caspian-only" countries
// (Kazakhstan, Turkmenistan, Azerbaijan) — they have shoreline but no open
// ocean connection, so we treat them as landlocked for naval gameplay.
const LANDLOCKED_ISO3 = new Set([
	// Africa
	"BDI", // Burundi
	"BFA", // Burkina Faso
	"BWA", // Botswana
	"CAF", // Central African Republic
	"ETH", // Ethiopia
	"LSO", // Lesotho
	"MLI", // Mali
	"MWI", // Malawi
	"NER", // Niger
	"RWA", // Rwanda
	"SSD", // South Sudan
	"SWZ", // Eswatini
	"TCD", // Chad
	"UGA", // Uganda
	"ZMB", // Zambia
	"ZWE", // Zimbabwe
	// Europe
	"AND", // Andorra
	"AUT", // Austria
	"BLR", // Belarus
	"CHE", // Switzerland
	"CZE", // Czech Republic
	"HUN", // Hungary
	"LIE", // Liechtenstein
	"LUX", // Luxembourg
	"MDA", // Moldova
	"MKD", // North Macedonia
	"SMR", // San Marino
	"SRB", // Serbia
	"SVK", // Slovakia
	"VAT", // Vatican City
	"XKX", // Kosovo (GeoNames uses XKX)
	// Asia
	"AFG", // Afghanistan
	"ARM", // Armenia
	"AZE", // Azerbaijan (Caspian-only)
	"BTN", // Bhutan
	"KAZ", // Kazakhstan (Caspian-only)
	"KGZ", // Kyrgyzstan
	"LAO", // Laos
	"MNG", // Mongolia
	"NPL", // Nepal
	"TJK", // Tajikistan
	"TKM", // Turkmenistan (Caspian-only)
	"UZB", // Uzbekistan
	// Americas
	"BOL", // Bolivia
	"PRY", // Paraguay
]);

// Per-bucket city counts: top / mid / bottom population thirds within bucket.
const PLAYABLE_TIER = { top: 12, mid: 10, low: 8 } as const;
const DECORATION_TIER = { top: 6, mid: 4, low: 3 } as const;

// Min-distance veto floor. Larger countries scale up via the formula in
// minDistanceKm() below.
const MIN_DISTANCE_FLOOR_KM = 30;
const MIN_DISTANCE_SCALE = 0.4;

const OUT_JSON = join(REPO_ROOT, "packages", "world-data", "test-world.json");
const OUT_SQL = join(REPO_ROOT, "packages", "db", "drizzle", "0010_world_v2_seed.sql");
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
	// Filled by enrichWithCoastality() before pickCitiesFor runs, so the picker
	// can promote a coastal anchor without re-doing the distance math itself.
	isCoastal: boolean;
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
		byIso2.get(iso2)?.push({
			id,
			name,
			asciiName,
			lat,
			lng,
			countryIso2: iso2,
			featureCode,
			population,
			isCoastal: false, // filled by enrichWithCoastality
		});
	}
	return byIso2;
}

// ── 2b. Coastline + port overrides ──────────────────────────────────────────

type LngLat = [number, number]; // GeoJSON convention: [lng, lat]
type Polyline = {
	verts: LngLat[];
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
};

async function loadCoastlinePolylines(): Promise<Polyline[]> {
	const buf = await fetchCached(COASTLINE_GEOJSON_URL, "ne_50m_coastline.geojson");
	const fc = JSON.parse(buf.toString("utf8")) as {
		features: Array<{ geometry: { type: string; coordinates: unknown } }>;
	};
	const polys: Polyline[] = [];
	const pushLine = (verts: LngLat[]) => {
		if (verts.length < 2) return;
		let minLat = 90;
		let maxLat = -90;
		let minLng = 180;
		let maxLng = -180;
		for (const v of verts) {
			if (v[1] < minLat) minLat = v[1];
			if (v[1] > maxLat) maxLat = v[1];
			if (v[0] < minLng) minLng = v[0];
			if (v[0] > maxLng) maxLng = v[0];
		}
		polys.push({ verts, minLat, maxLat, minLng, maxLng });
	};
	for (const f of fc.features) {
		const g = f.geometry;
		if (g.type === "LineString") pushLine(g.coordinates as LngLat[]);
		else if (g.type === "MultiLineString") {
			for (const line of g.coordinates as LngLat[][]) pushLine(line);
		}
	}
	return polys;
}

/*
 * Approximate min-km-distance from (lat,lng) to a polyline's bounding box.
 * Cheap pruning: if this is already > current best, the polyline can't beat it.
 * Equirectangular approximation — fine for the 10–50 km scale we care about.
 */
function bboxDistanceKm(lat: number, lng: number, p: Polyline): number {
	const dLat = lat < p.minLat ? p.minLat - lat : lat > p.maxLat ? lat - p.maxLat : 0;
	const dLng = lng < p.minLng ? p.minLng - lng : lng > p.maxLng ? lng - p.maxLng : 0;
	const kmLat = dLat * 111;
	const kmLng = dLng * 111 * Math.cos((lat * Math.PI) / 180);
	return Math.sqrt(kmLat * kmLat + kmLng * kmLng);
}

/*
 * Distance from (lat,lng) to a single line segment, using equirectangular
 * projection local to the city. Accurate to <0.1% within ~50 km — well below
 * our 10 km threshold's precision needs.
 */
function pointToSegmentKm(lat: number, lng: number, a: LngLat, b: LngLat): number {
	const cosLat = Math.cos((lat * Math.PI) / 180);
	const ax = (a[0] - lng) * cosLat;
	const ay = a[1] - lat;
	const bx = (b[0] - lng) * cosLat;
	const by = b[1] - lat;
	const vx = bx - ax;
	const vy = by - ay;
	const len2 = vx * vx + vy * vy;
	let fx: number;
	let fy: number;
	if (len2 === 0) {
		fx = ax;
		fy = ay;
	} else {
		let t = -(ax * vx + ay * vy) / len2;
		t = Math.max(0, Math.min(1, t));
		fx = ax + t * vx;
		fy = ay + t * vy;
	}
	const kmLat = fy * 111;
	const kmLng = fx * 111;
	return Math.sqrt(kmLat * kmLat + kmLng * kmLng);
}

function distanceToCoastlineKm(polylines: Polyline[], lat: number, lng: number): number {
	let min = Number.POSITIVE_INFINITY;
	for (const p of polylines) {
		if (bboxDistanceKm(lat, lng, p) > min) continue;
		for (let i = 0; i < p.verts.length - 1; i++) {
			const a = p.verts[i];
			const b = p.verts[i + 1];
			if (!a || !b) continue;
			const d = pointToSegmentKm(lat, lng, a, b);
			if (d < min) min = d;
		}
	}
	return min;
}

const portOverridesSchema = z.object({
	version: z.literal(1),
	ports: z.array(
		z.object({
			country: z.string().length(3),
			name: z.string(), // matches GeoNames asciiName
			note: z.string().optional(),
		}),
	),
});

async function loadPortOverrides(): Promise<Set<string>> {
	const path = join(REPO_ROOT, "packages", "world-data", "port-overrides.json");
	if (!existsSync(path)) return new Set();
	const raw = JSON.parse(await readFile(path, "utf8"));
	const parsed = portOverridesSchema.parse(raw);
	const set = new Set<string>();
	for (const p of parsed.ports) set.add(`${p.country}:${p.name}`);
	console.log(`[ports] ${set.size} river-port overrides loaded`);
	return set;
}

// ── 3. Curation ─────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
	const toRad = (x: number) => (x * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/*
 * Country-area-aware minimum spacing between picked cities.
 * 30 km floor; scales as sqrt(area/N) so larger countries spread further.
 *   Romania (238k km², N=10) -> 62 km
 *   USA    (9.6M km², N=12) -> 358 km
 *   Belgium (31k km², N=6)  -> floor (30 km)
 */
function minDistanceKm(areaKm2: number, targetCount: number): number {
	const target = Math.max(1, targetCount);
	return Math.max(MIN_DISTANCE_FLOOR_KM, MIN_DISTANCE_SCALE * Math.sqrt(areaKm2 / target));
}

// Pop floor for the "real large city" coastal anchor. Below this we fall back
// to the largest available coastal city of any size.
const COASTAL_ANCHOR_MIN_POP = 100_000;

/*
 * Pick the country's cities under five rules:
 *   1. Drop GeoNames PPLX entries (sections of populated place — Bucharest
 *      Sector 2/3/4/5/6, etc.). These are subdivisions of bigger cities and
 *      cluster on top of capitals.
 *   2. Anchor 1 — capital (PPLC), always.
 *   3. Anchor 2 — coastal anchor: only for non-landlocked countries, only if
 *      no anchor already qualifies as coastal. Pick the largest coastal city
 *      with pop >= COASTAL_ANCHOR_MIN_POP; if none qualifies, fall back to the
 *      largest coastal city of any size (still subject to the country having
 *      one in cities500).
 *   4. Anchor 3 — largest non-capital, regardless of coast/inland.
 *   5. Fill remaining slots greedy-by-pop, vetoing any candidate within
 *      minDistanceKm() of an already-picked city.
 *
 * Anchors are exempt from the spread veto BY DEFINITION — we want famous
 * cities preserved even when they sit close to one another.
 */
function pickCitiesFor(
	country: CountryInfo,
	raw: RawCity[],
	limit: number,
	isCountryLandlocked: boolean,
): RawCity[] {
	const sorted = [...raw]
		.filter((c) => c.featureCode !== "PPLX")
		.sort((a, b) => b.population - a.population);
	const minKm = minDistanceKm(country.areaKm2, limit);

	const picked: RawCity[] = [];

	// Anchor 1: capital
	const capital = sorted.find((c) => c.featureCode === "PPLC");
	if (capital) picked.push(capital);

	// Anchor 2: coastal anchor (coastal countries only, only if no current
	// anchor is already coastal). Promotes a coastal city even when natural
	// pop sort wouldn't have picked one — see Q3 grilling.
	if (!isCountryLandlocked && !picked.some((p) => p.isCoastal) && picked.length < limit) {
		const bigCoastal = sorted.find(
			(c) => c.isCoastal && c.population >= COASTAL_ANCHOR_MIN_POP && !picked.includes(c),
		);
		const fallbackCoastal = sorted.find((c) => c.isCoastal && !picked.includes(c));
		const coastalAnchor = bigCoastal ?? fallbackCoastal;
		if (coastalAnchor) {
			picked.push(coastalAnchor);
			if (!bigCoastal) {
				console.log(
					`[coast-fallback] ${country.iso3} no >=${COASTAL_ANCHOR_MIN_POP} coastal city; using ${coastalAnchor.name} (${coastalAnchor.population})`,
				);
			}
		} else {
			console.warn(`[no-coast] ${country.iso3} (${country.name}) has no coastal city in cities500`);
		}
	}

	// Anchor 3: largest non-capital (exempt from veto)
	const largestNonCapital = sorted.find((c) => c.featureCode !== "PPLC" && !picked.includes(c));
	if (largestNonCapital && picked.length < limit) {
		picked.push(largestNonCapital);
	}

	// Fill: greedy-by-pop with min-distance veto
	for (const c of sorted) {
		if (picked.length >= limit) break;
		if (picked.includes(c)) continue;
		if (picked.some((p) => haversineKm(p, c) < minKm)) continue;
		picked.push(c);
	}

	if (picked.length < limit) {
		console.warn(
			`[warn] ${country.name} (${country.iso3}) only ${picked.length}/${limit} cities (min spacing ${minKm.toFixed(0)} km)`,
		);
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
			`INSERT INTO "country" ("code", "name", "area_km2", "is_playable", "is_landlocked") VALUES ('${sqlEscape(c.code)}', '${sqlEscape(c.name)}', ${c.areaKm2}, ${c.isPlayable}, ${c.isLandlocked});`,
		);
	}
	lines.push("");
	for (const c of world.cities) {
		lines.push(
			`INSERT INTO "city" ("id", "country_code", "name", "lat", "lng", "base_population", "is_capital", "is_coastal", "money_mult", "steel_mult", "electronics_mult", "oil_mult") VALUES ('${c.id}', '${sqlEscape(c.countryCode)}', '${sqlEscape(c.name)}', ${c.lat}, ${c.lng}, ${c.basePopulation}, ${c.isCapital}, ${c.isCoastal}, ${c.moneyMult}, ${c.steelMult}, ${c.electronicsMult}, ${c.oilMult});`,
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

	const coastline = await loadCoastlinePolylines();
	const totalVerts = coastline.reduce((n, p) => n + p.verts.length, 0);
	console.log(`[coastline] ${coastline.length} polylines, ${totalVerts} vertices`);

	const portOverrides = await loadPortOverrides();

	// Enrich every raw candidate city with isCoastal so the picker can pick a
	// coastal anchor without re-doing distance math. Skips cities in landlocked
	// countries — Caspian-shore cities (Atyrau, Aktau, Baku) deliberately stay
	// false even though NE coastline traces the Caspian.
	for (const country of eligible) {
		const isLandlocked = LANDLOCKED_ISO3.has(country.iso3);
		const cities = cityMap.get(country.iso2);
		if (!cities) continue;
		for (const c of cities) {
			if (isLandlocked) continue;
			const dist = distanceToCoastlineKm(coastline, c.lat, c.lng);
			const overrideKey = `${country.iso3}:${c.asciiName || c.name}`;
			c.isCoastal = dist <= COASTAL_DISTANCE_KM || portOverrides.has(overrideKey);
		}
	}

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
			const isLandlocked = LANDLOCKED_ISO3.has(country.iso3);
			const limit = tierLimit(idx, bucket.length, playableBucket);
			const raw = cityMap.get(country.iso2) ?? [];
			const top = pickCitiesFor(country, raw, limit, isLandlocked);

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
				isLandlocked,
			});

			for (const c of top) {
				const bonusKey = `${country.iso3}:${c.asciiName || c.name}`;
				const b = bonuses[bonusKey] ?? {};

				cityRows.push({
					// GeoNames numeric `id` is globally unique per city — using it in
					// the UUID hash key avoids the collision two San Josés in Costa
					// Rica caused when the key was `iso3:asciiName` only.
					id: uuidv5(`${country.iso3}:${c.id}`, FIXTURE_UUID_NAMESPACE),
					countryCode: country.iso3,
					name: c.name,
					lat: c.lat,
					lng: c.lng,
					basePopulation: c.population,
					isCapital: c.featureCode === "PPLC",
					isCoastal: c.isCoastal,
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
		source: "GeoNames cities500 + countryInfo (CC-BY 4.0)",
		countries: countryRows,
		cities: cityRows,
	};

	await writeFile(OUT_JSON, `${JSON.stringify(world, null, "\t")}\n`);
	await writeFile(OUT_SQL, emitSql(world));

	const playableCount = countryRows.filter((c) => c.isPlayable).length;
	const landlockedCount = countryRows.filter((c) => c.isLandlocked).length;
	const coastalCount = cityRows.filter((c) => c.isCoastal).length;
	console.log(
		`[done] ${countryRows.length} countries (${playableCount} playable, ${countryRows.length - playableCount} decoration, ${landlockedCount} landlocked), ${cityRows.length} cities (${coastalCount} coastal)`,
	);
	console.log(`        -> ${OUT_JSON}`);
	console.log(`        -> ${OUT_SQL}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
