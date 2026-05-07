"use client";

import type { CityRender } from "@/components/game-map";
import { UnitIcon } from "@/components/icons";
import type { WorldDataset } from "@geopolitik/shared/api";
import type { Map as MapInstance } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

/*
 * <MapLabels> — Phase 6c.
 *
 * DOM-rendered country + city name labels overlaying the MapLibre
 * canvas. We use DOM (not MapLibre symbol layers) so the labels can
 * use the game's actual web fonts (Space Grotesk for country names,
 * JetBrains Mono for city names) without hosting glyph PBFs, and so
 * "click a label to hide it" is a trivial React state mutation.
 *
 * Country centroids are computed on first load from the polygon
 * GeoJSON already shipping at /world-countries.geojson (the same URL
 * MapLibre fetches it from, so the browser cache makes this free).
 *
 * Re-projection of every label's lng/lat → pixel coordinates runs on
 * every map move, coalesced through requestAnimationFrame. At 140
 * country centroids + a couple thousand cities this stays well under
 * a frame budget; viewport-clipping further trims per-frame work.
 *
 * Visibility windows by zoom (linear opacity ramps):
 *   country labels: full at z 1.5–4, fade out 4–5.5
 *   city labels:    fade in 4.5–5.5, full from 5.5+
 *
 * Click-to-hide: tapping a label adds its key to a session-local
 * Set<string>. The set is keyed `c:<iso3>` for countries, `p:<id>`
 * for cities. Hidden state persists for the player's session.
 */

interface CountryCentroid {
	iso3: string;
	name: string;
	lng: number;
	lat: number;
	/** Bounding-box area in square degrees of the country's largest
	 *  polygon. Used as a "size" priority so big countries draw first
	 *  and tiny island nations drop out at low zoom. Russia ≈ 4500;
	 *  USA ≈ 1800; France ≈ 90; Andorra ≈ 0.05. */
	area: number;
	/** Country has a row in `factions.json` and is therefore part of the
	 *  game. Non-playable polygons (Antarctic territories, French
	 *  Guiana, Greenland, etc.) get filtered out so labels track gameplay. */
	playable: boolean;
}

interface MapLabelsProps {
	map: MapInstance | null;
	cities: WorldDataset["cities"] | undefined;
	countries: WorldDataset["countries"] | undefined;
	/** Per-game render rows — carries ownership info for capital markers
	 *  (so the star color matches the dot color rule: mine=amber, ally=
	 *  blue, foreign=grey). Only the capital subset is used. */
	citiesRender?: CityRender[];
	onCityClick?: (cityId: string) => void;
}

export function MapLabels({ map, cities, countries, citiesRender, onCityClick }: MapLabelsProps) {
	const [centroids, setCentroids] = useState<CountryCentroid[] | null>(null);
	const [zoom, setZoom] = useState(1);
	const [tickCounter, setTickCounter] = useState(0);
	const overlayRef = useRef<HTMLDivElement | null>(null);
	const [hidden, setHidden] = useState<Set<string>>(() => new Set());

	// Load + compute country centroids once. Browser cache covers the
	// re-fetch since MapLibre already loaded this URL.
	useEffect(() => {
		let cancelled = false;
		fetch("/world-countries.geojson")
			.then((r) => r.json() as Promise<GeoJSON.FeatureCollection>)
			.then((fc) => {
				if (cancelled) return;
				const countryNameByCode = new Map<string, string>();
				const playableSet = new Set<string>();
				if (countries) {
					for (const c of countries) {
						countryNameByCode.set(c.code, c.name);
						if (c.isPlayable) playableSet.add(c.code);
					}
				}
				const out: CountryCentroid[] = [];
				for (const f of fc.features) {
					const props = (f.properties ?? {}) as Record<string, unknown>;
					const iso3 = (props.ISO_A3 as string) ?? (props.ADM0_A3 as string) ?? null;
					if (!iso3 || iso3 === "ATA" || iso3 === "-99") continue;
					const stats = polygonBboxStats(f.geometry as GeoJSON.Geometry);
					if (!stats) continue;
					out.push({
						iso3,
						name:
							countryNameByCode.get(iso3) ??
							(props.NAME as string) ??
							(props.ADMIN as string) ??
							iso3,
						lng: stats.center[0],
						lat: stats.center[1],
						area: stats.area,
						playable: playableSet.has(iso3),
					});
				}
				setCentroids(out);
			})
			.catch(() => {
				// Silently skip on fetch failure; the map still renders fine.
			});
		return () => {
			cancelled = true;
		};
	}, [countries]);

	// Track the map's current zoom + nudge a re-render on every move via
	// RAF coalescing. The actual pixel positions are recomputed inside the
	// render below using map.project().
	useEffect(() => {
		if (!map) return;
		let raf: number | null = null;
		const update = () => {
			raf = null;
			setZoom(map.getZoom());
			setTickCounter((n) => (n + 1) % 1024);
		};
		const schedule = () => {
			if (raf === null) raf = requestAnimationFrame(update);
		};
		schedule();
		map.on("move", schedule);
		map.on("zoom", schedule);
		return () => {
			map.off("move", schedule);
			map.off("zoom", schedule);
			if (raf !== null) cancelAnimationFrame(raf);
		};
	}, [map]);

	// Visibility ramps. The ramps overlap (4.5–5.5 is the crossover) so the
	// transition feels smooth rather than a hard switch.
	const countryOpacity = clamp01(rampDown(zoom, 4, 5.5));
	const cityOpacity = clamp01(rampUp(zoom, 4.5, 5.5));

	// Plain per-render computation rather than useMemo — pan events bump
	// `tickCounter`, the parent re-renders, and we recompute the projected
	// pixel positions here. The work is cheap: ~140 country centroids + ≤50
	// cities visible after the bbox filter, so a per-frame rebuild fits in
	// well under a frame budget. Reference tickCounter explicitly so it's
	// not pruned by hot-reload tooling.
	void tickCounter;
	const visibleCountryLabels: Array<CountryCentroid & { x: number; y: number }> = [];
	if (map && centroids && countryOpacity > 0) {
		const bounds = map.getBounds();
		const sw = bounds.getSouthWest();
		const ne = bounds.getNorthEast();
		// Importance threshold: at world zoom show only continental-scale
		// nations; lift the bar progressively as the player zooms in.
		// Bbox-area (sq deg) cutoffs roughly correspond to:
		//   600 → Russia / USA / China / Canada / Brazil / Australia / India
		//   150 → above + Argentina / Algeria / Mexico / Iran / Saudi / DRC
		//    30 → most major nations including most of Europe
		//     5 → small but non-trivial (Belgium, Netherlands, Denmark…)
		//     0 → all (microstates, Caribbean islands, Pacific)
		const minArea = zoom < 1.8 ? 600 : zoom < 2.4 ? 150 : zoom < 3.0 ? 30 : zoom < 3.8 ? 5 : 0;
		// Sort by area descending so big countries get placed first and tiny
		// ones drop in collision detection rather than the other way around.
		const candidates = centroids
			.filter((c) => c.playable)
			.filter((c) => c.area >= minArea)
			.filter((c) => !hidden.has(`c:${c.iso3}`))
			.filter((c) => c.lng >= sw.lng && c.lng <= ne.lng && c.lat >= sw.lat && c.lat <= ne.lat)
			.sort((a, b) => b.area - a.area);
		// Approximate font size at this zoom — used for collision rects.
		const fontPx = 11;
		const placed: PlacedRect[] = [];
		for (const c of candidates) {
			const p = map.project([c.lng, c.lat]);
			const w = approxTextWidth(c.name, fontPx, 1.5);
			const h = fontPx + 2;
			const rect = { x: p.x - w / 2 - 6, y: p.y - h / 2 - 2, w: w + 12, h: h + 4 };
			if (placed.some((r) => rectsOverlap(rect, r))) continue;
			placed.push(rect);
			visibleCountryLabels.push({ ...c, x: p.x, y: p.y });
		}
	}

	// Capital star markers — replace the dot for capital cities. Track the
	// same opacity + size behavior as city-circle (game-map.tsx) so capitals
	// fade out at world zoom and grow as the player zooms in. Color matches
	// the dot rule: mine=amber, ally=blue, foreign/unowned=grey.
	//
	// City-circle's visibility ramp is 2.8→3.2 (owned cities visible above
	// 2.8, all visible above 3.2). Use the same window for the star — below
	// 2.4 we don't even render the DOM node since the star would be a single
	// fuzzy pixel.
	const capitalOpacity = clamp01(rampUp(zoom, 2.4, 3.2));
	const capitalSizePx = lerp(zoom, 2.4, 8, 7, 18);
	const visibleCapitalMarkers: Array<{
		id: string;
		name: string;
		color: string;
		x: number;
		y: number;
	}> = [];
	if (map && citiesRender && capitalOpacity > 0) {
		const bounds = map.getBounds();
		const sw = bounds.getSouthWest();
		const ne = bounds.getNorthEast();
		for (const c of citiesRender) {
			if (!c.isCapital) continue;
			if (c.lng < sw.lng || c.lng > ne.lng || c.lat < sw.lat || c.lat > ne.lat) continue;
			const p = map.project([c.lng, c.lat]);
			const color =
				(c.isMine || c.isAlly) && c.ownerColor
					? c.ownerColor
					: // CITY_NEUTRAL_COLOR mirror — keep in sync with game-map.tsx.
						"#4a5666";
			visibleCapitalMarkers.push({
				id: c.id,
				name: c.name,
				color,
				x: p.x,
				y: p.y,
			});
		}
	}

	const visibleCityLabels: Array<{
		id: string;
		name: string;
		isCapital: boolean;
		population: number;
		x: number;
		y: number;
	}> = [];
	if (map && cities && cityOpacity > 0) {
		const bounds = map.getBounds();
		const sw = bounds.getSouthWest();
		const ne = bounds.getNorthEast();
		// At lower zooms only show the largest cities + capitals to avoid
		// label soup. Threshold lifts as the player zooms further in.
		const minPop = zoom < 5.5 ? 1_500_000 : zoom < 6.5 ? 500_000 : zoom < 8 ? 150_000 : 0;
		// Sort by importance: capitals first, then by population descending.
		// Higher-priority labels claim screen space first; lower-priority
		// ones drop on collision instead.
		const candidates = cities
			.filter((c) => !hidden.has(`p:${c.id}`))
			.filter((c) => c.isCapital || c.basePopulation >= minPop)
			.filter((c) => c.lng >= sw.lng && c.lng <= ne.lng && c.lat >= sw.lat && c.lat <= ne.lat)
			.sort((a, b) => {
				if (a.isCapital !== b.isCapital) return a.isCapital ? -1 : 1;
				return b.basePopulation - a.basePopulation;
			});
		const fontPx = 10;
		const placed: PlacedRect[] = [];
		for (const c of candidates) {
			const p = map.project([c.lng, c.lat]);
			const w = approxTextWidth(c.name, fontPx, 0.4);
			const h = fontPx + 2;
			// City label is bottom-anchored 14px above the city center
			// (see JSX). Collision rect matches that geometry so the test
			// uses the actual rendered position.
			const rect = { x: p.x - w / 2 - 4, y: p.y - 14 - h - 2, w: w + 8, h: h + 4 };
			if (placed.some((r) => rectsOverlap(rect, r))) continue;
			placed.push(rect);
			visibleCityLabels.push({
				id: c.id,
				name: c.name,
				isCapital: c.isCapital,
				population: c.basePopulation,
				x: p.x,
				y: p.y,
			});
		}
	}

	if (!map) return null;

	return (
		<div
			ref={overlayRef}
			className="pointer-events-none absolute inset-0 overflow-hidden"
			aria-hidden
		>
			{/* Country labels — Space Grotesk, mil-spec uppercase + tracking.
				`pointer-events-none` lets clicks fall through to MapLibre's
				country-fill layer beneath, which opens the country popover. */}
			{countryOpacity > 0 &&
				visibleCountryLabels.map((c) => (
					<span
						key={`c:${c.iso3}`}
						className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/85 transition-opacity duration-150"
						style={{
							left: `${c.x}px`,
							top: `${c.y}px`,
							opacity: countryOpacity,
							textShadow: "0 0 4px #0a0e14, 0 0 4px #0a0e14, 0 0 4px #0a0e14",
						}}
					>
						{c.name}
					</span>
				))}

			{/* Capital star markers — replace the city dot for capital
				cities. Opacity + size scale with zoom so capitals fade out
				at world zoom and grow as the player zooms in, matching the
				city-circle ramp. Color rule: mine=amber, ally=blue,
				foreign/unowned=neutral grey. */}
			{capitalOpacity > 0 &&
				visibleCapitalMarkers.map((m) => (
					<button
						type="button"
						key={`star:${m.id}`}
						aria-label={`Capital of ${m.name}`}
						onClick={(e) => {
							e.stopPropagation();
							onCityClick?.(m.id);
						}}
						className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none transition-transform duration-150 hover:scale-110"
						style={{
							left: `${m.x}px`,
							top: `${m.y}px`,
							color: m.color,
							opacity: capitalOpacity,
							filter: "drop-shadow(0 0 1.5px #0a0e14) drop-shadow(0 0 1.5px #0a0e14)",
						}}
						title={m.name}
					>
						<UnitIcon glyph="capital" size={capitalSizePx} aria-hidden />
					</button>
				))}

			{/* City labels — JetBrains Mono, anchored above the dot */}
			{cityOpacity > 0 &&
				visibleCityLabels.map((c) => (
					<button
						type="button"
						key={`p:${c.id}`}
						onClick={(e) => {
							e.stopPropagation();
							setHidden((prev) => {
								const next = new Set(prev);
								next.add(`p:${c.id}`);
								return next;
							});
						}}
						className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full cursor-pointer select-none whitespace-nowrap font-mono text-[10px] text-foreground/90 tabular-nums transition-opacity duration-150 hover:text-foreground"
						style={{
							left: `${c.x}px`,
							// Bottom edge of the label sits 14px above the city
							// center — clears the largest capital star (radius
							// 9px) plus a small gap so the text never touches the
							// marker. -translate-y-full anchors the bottom of the
							// label to the `top` coordinate.
							top: `${c.y - 14}px`,
							opacity: cityOpacity,
							textShadow: "0 0 3px #0a0e14, 0 0 3px #0a0e14, 0 0 3px #0a0e14",
						}}
						title={`${c.name} — click to hide`}
					>
						{c.name}
					</button>
				))}
		</div>
	);
}

function rampUp(z: number, start: number, end: number) {
	if (z <= start) return 0;
	if (z >= end) return 1;
	return (z - start) / (end - start);
}

function rampDown(z: number, start: number, end: number) {
	if (z <= start) return 1;
	if (z >= end) return 0;
	return 1 - (z - start) / (end - start);
}

function clamp01(n: number) {
	return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Linear interpolation: at zoom ≤ z0 return v0, at zoom ≥ z1 return v1,
 *  else linearly interpolate. No clamping needed for our use cases since
 *  callers gate on opacity = 0 below z0. */
function lerp(zoom: number, z0: number, v0: number, z1: number, v1: number): number {
	if (zoom <= z0) return v0;
	if (zoom >= z1) return v1;
	const t = (zoom - z0) / (z1 - z0);
	return v0 + t * (v1 - v0);
}

/**
 * Bounding-box center + area of a polygon's largest ring. Good enough
 * for label placement and "country importance" sorting; not a true
 * centroid (no shoelace formula). For MultiPolygon countries we pick
 * the polygon with the most coordinates — usually the mainland — so
 * labels don't drop on tiny offshore islands.
 *
 * Area is in square degrees (lng-span × lat-span). Useful only as a
 * relative ordering, not as a real geographic area.
 */
function polygonBboxStats(
	geom: GeoJSON.Geometry,
): { center: [number, number]; area: number } | null {
	let lngMin = Number.POSITIVE_INFINITY;
	let lngMax = Number.NEGATIVE_INFINITY;
	let latMin = Number.POSITIVE_INFINITY;
	let latMax = Number.NEGATIVE_INFINITY;

	const visit = (coords: GeoJSON.Position[]) => {
		for (const pos of coords) {
			const lng = pos[0] as number;
			const lat = pos[1] as number;
			if (lng < lngMin) lngMin = lng;
			if (lng > lngMax) lngMax = lng;
			if (lat < latMin) latMin = lat;
			if (lat > latMax) latMax = lat;
		}
	};

	if (geom.type === "Polygon") {
		for (const ring of geom.coordinates) visit(ring);
	} else if (geom.type === "MultiPolygon") {
		let largest = geom.coordinates[0];
		let largestSize = 0;
		for (const polygon of geom.coordinates) {
			const size = polygon[0]?.length ?? 0;
			if (size > largestSize) {
				largest = polygon;
				largestSize = size;
			}
		}
		if (largest) for (const ring of largest) visit(ring);
	} else {
		return null;
	}

	if (!Number.isFinite(lngMin)) return null;
	const area = (lngMax - lngMin) * (latMax - latMin);
	return { center: [(lngMin + lngMax) / 2, (latMin + latMax) / 2], area };
}

/** Approximate text width in pixels for collision detection. Conservative
 *  multiplier (0.62) leaves a small gap between adjacent labels. */
function approxTextWidth(text: string, fontSize: number, tracking = 0): number {
	return text.length * fontSize * 0.62 + (text.length - 1) * tracking;
}

interface PlacedRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

function rectsOverlap(a: PlacedRect, b: PlacedRect): boolean {
	return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}
