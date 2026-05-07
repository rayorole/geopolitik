"use client";

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
}

interface MapLabelsProps {
	map: MapInstance | null;
	cities: WorldDataset["cities"] | undefined;
	countries: WorldDataset["countries"] | undefined;
}

export function MapLabels({ map, cities, countries }: MapLabelsProps) {
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
				if (countries) {
					for (const c of countries) countryNameByCode.set(c.code, c.name);
				}
				const out: CountryCentroid[] = [];
				for (const f of fc.features) {
					const props = (f.properties ?? {}) as Record<string, unknown>;
					const iso3 = (props.ISO_A3 as string) ?? (props.ADM0_A3 as string) ?? null;
					if (!iso3 || iso3 === "ATA" || iso3 === "-99") continue;
					const center = polygonBboxCenter(f.geometry as GeoJSON.Geometry);
					if (!center) continue;
					out.push({
						iso3,
						name:
							countryNameByCode.get(iso3) ??
							(props.NAME as string) ??
							(props.ADMIN as string) ??
							iso3,
						lng: center[0],
						lat: center[1],
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
		for (const c of centroids) {
			if (hidden.has(`c:${c.iso3}`)) continue;
			if (c.lng < sw.lng || c.lng > ne.lng || c.lat < sw.lat || c.lat > ne.lat) continue;
			const p = map.project([c.lng, c.lat]);
			visibleCountryLabels.push({ ...c, x: p.x, y: p.y });
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
		for (const c of cities) {
			if (hidden.has(`p:${c.id}`)) continue;
			if (!c.isCapital && c.basePopulation < minPop) continue;
			if (c.lng < sw.lng || c.lng > ne.lng || c.lat < sw.lat || c.lat > ne.lat) continue;
			const p = map.project([c.lng, c.lat]);
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
			{/* Country labels — Space Grotesk, mil-spec uppercase + tracking */}
			{countryOpacity > 0 &&
				visibleCountryLabels.map((c) => (
					<button
						type="button"
						key={`c:${c.iso3}`}
						onClick={(e) => {
							e.stopPropagation();
							setHidden((prev) => {
								const next = new Set(prev);
								next.add(`c:${c.iso3}`);
								return next;
							});
						}}
						className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none whitespace-nowrap font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/85 transition-opacity duration-150 hover:text-foreground"
						style={{
							left: `${c.x}px`,
							top: `${c.y}px`,
							opacity: countryOpacity,
							textShadow: "0 0 4px #0a0e14, 0 0 4px #0a0e14, 0 0 4px #0a0e14",
						}}
						title={`${c.name} — click to hide`}
					>
						{c.name}
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
						className={`pointer-events-auto absolute -translate-x-1/2 cursor-pointer select-none whitespace-nowrap font-mono text-[10px] tabular-nums transition-opacity duration-150 ${
							c.isCapital ? "font-semibold text-primary" : "text-foreground/90"
						} hover:text-foreground`}
						style={{
							left: `${c.x}px`,
							// 14px above the dot. Dots top out at radius ~6px + stroke,
							// so this keeps the label clear of the marker at every zoom.
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

/**
 * Bounding-box center of a polygon's largest ring. Good enough for
 * label placement; not a true centroid (no shoelace formula). For
 * MultiPolygon countries we pick the polygon with the most coordinates
 * — usually the mainland — so labels don't drop on tiny offshore
 * islands.
 */
function polygonBboxCenter(geom: GeoJSON.Geometry): [number, number] | null {
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
	return [(lngMin + lngMax) / 2, (latMin + latMax) / 2];
}
