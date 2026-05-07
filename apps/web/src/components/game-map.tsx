"use client";

import { UnitIcon } from "@/components/icons";
import { MapLabels } from "@/components/map-labels";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { alpha3ToAlpha2 } from "@/lib/country-flags";
import type { WorldDataset } from "@geopolitik/shared/api";
import { factionForCountry } from "@geopolitik/shared/factions";
import { Copy } from "lucide-react";
import maplibregl, { type Map as MapInstance } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
 * <GameMap> — Phase 1 (slim).
 * Pan + zoom across the world. Country polygons render from a static
 * Natural-Earth 110m GeoJSON served from /world-countries.geojson. Hover
 * highlights a country; right-click opens a shadcn dropdown anchored at
 * the click point — controlled programmatically because MapLibre owns the
 * canvas contextmenu event, so the bubbled-up React contextmenu never
 * fires. The MapLibre `contextmenu` handler reads lat/lng + features and
 * positions an invisible 1×1 trigger at the cursor; Radix anchors the
 * menu off that. Cursor coordinates and onHoverCountry stream while the
 * pointer is over land; leaving a polygon or the map does not clear the
 * last HUD values.
 *
 * No tiles yet. Phase 1 (full) swaps in Protomaps .pmtiles on R2 and a
 * PixiJS overlay for unit sprites; this slim shell already supports both
 * because the country layer is just one of MapLibre's normal layers.
 */

/*
 * MapLibre's style validator doesn't accept `oklch()` strings, so we mirror
 * the design tokens here as the closest sRGB equivalents. If the tokens move,
 * update both places.
 */
const COLOR = {
	ink1: "#0a0e14", // background canvas (Antarctica + non-mapped land)
	ink3: "#1a212c", // country fill (default)
	ink5: "#34404f", // country outline
	water1: "#0e2030", // ocean + lake fill — slightly bluer than ink1 so water reads as water
	water2: "#2a4a64", // river polyline — brighter steel blue, visible on country fill
	signal500: "#d68b3e", // sodium-vapor amber, full opacity
	signal500a18: "rgba(214, 139, 62, 0.22)", // hover fill
	signal500a40: "rgba(214, 139, 62, 0.45)", // owned-country fill
	ally500: "#4a90d9", // allied-country outline + city dot color (Phase 6c)
	ally500a40: "rgba(74, 144, 217, 0.45)", // allied-country fill
} as const;

const CITY_NEUTRAL_COLOR = "#4a5666";
const CITY_SELECTED_RING = "#ffe082";

const NEVER_MATCH = "__NONE__";

function fillExpression(
	myCountryCode: string | null | undefined,
	alliedCountryCodes: readonly string[] = [],
): maplibregl.DataDrivenPropertyValueSpecification<string> {
	const code = myCountryCode ?? NEVER_MATCH;
	const allied = alliedCountryCodes.length > 0 ? alliedCountryCodes : [NEVER_MATCH];
	return [
		"case",
		// You: amber.
		["any", ["==", ["get", "ISO_A3"], code], ["==", ["get", "ADM0_A3"], code]],
		COLOR.signal500a40,
		// Alliance co-members: blue.
		[
			"any",
			["in", ["get", "ISO_A3"], ["literal", allied]],
			["in", ["get", "ADM0_A3"], ["literal", allied]],
		],
		COLOR.ally500a40,
		// Hover state — only when not allied or owned.
		["boolean", ["feature-state", "hover"], false],
		COLOR.signal500a18,
		COLOR.ink3,
	] as maplibregl.DataDrivenPropertyValueSpecification<string>;
}

function lineColorExpression(
	myCountryCode: string | null | undefined,
	alliedCountryCodes: readonly string[] = [],
): maplibregl.DataDrivenPropertyValueSpecification<string> {
	const code = myCountryCode ?? NEVER_MATCH;
	const allied = alliedCountryCodes.length > 0 ? alliedCountryCodes : [NEVER_MATCH];
	return [
		"case",
		["any", ["==", ["get", "ISO_A3"], code], ["==", ["get", "ADM0_A3"], code]],
		COLOR.signal500,
		[
			"any",
			["in", ["get", "ISO_A3"], ["literal", allied]],
			["in", ["get", "ADM0_A3"], ["literal", allied]],
		],
		COLOR.ally500,
		["boolean", ["feature-state", "hover"], false],
		COLOR.signal500,
		COLOR.ink5,
	] as maplibregl.DataDrivenPropertyValueSpecification<string>;
}

// Southern-band ocean mask. Covers everything below -55° latitude with the
// ocean color so Antarctica + the unmapped south-polar gap (where neither
// the Natural Earth ocean polygon nor any country polygon paints) read as
// ocean. Inline GeoJSON — no external file fetch needed.
const SOUTH_MASK_GEOJSON: GeoJSON.FeatureCollection = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: {},
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[-180, -55],
						[180, -55],
						[180, -90],
						[-180, -90],
						[-180, -55],
					],
				],
			},
		},
	],
};

const STYLE: maplibregl.StyleSpecification = {
	version: 8,
	sources: {
		ocean: {
			type: "geojson",
			data: "/ne_50m_ocean.geojson",
		},
		lakes: {
			type: "geojson",
			data: "/ne_50m_lakes.geojson",
		},
		rivers: {
			type: "geojson",
			data: "/ne_50m_rivers_lake_centerlines.geojson",
		},
		countries: {
			type: "geojson",
			data: "/world-countries.geojson",
			generateId: true,
		},
		southMask: {
			type: "geojson",
			data: SOUTH_MASK_GEOJSON,
		},
		cities: {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
			promoteId: "cityId",
		},
	},
	layers: [
		{
			id: "background",
			type: "background",
			paint: { "background-color": COLOR.ink1 },
		},
		// Ocean polygon below countries — covers actual sea/ocean.
		{
			id: "ocean-fill",
			type: "fill",
			source: "ocean",
			paint: { "fill-color": COLOR.water1 },
		},
		// Southern-band ocean mask — paints everything below -55° latitude
		// in ocean color. Covers Antarctica AND the unmapped south-polar
		// strip below it (which neither ne_50m_ocean nor world-countries
		// polygons reach), so the bottom of the Mercator no longer reveals
		// the dark ink1 background.
		{
			id: "south-mask",
			type: "fill",
			source: "southMask",
			paint: { "fill-color": COLOR.water1 },
		},
		{
			id: "country-fill",
			type: "fill",
			source: "countries",
			filter: ["!=", ["get", "ISO_A3"], "ATA"],
			paint: {
				"fill-color": fillExpression(null),
				"fill-outline-color": COLOR.ink5,
			},
		},
		// Inland lakes — Caspian, Great Lakes, Victoria, Baikal — over country fill.
		{
			id: "lakes-fill",
			type: "fill",
			source: "lakes",
			paint: { "fill-color": COLOR.water1 },
		},
		// Major navigable rivers — Mississippi, Amazon, Yangtze, etc. Thin
		// hairline at world zoom; thickens as you zoom in.
		{
			id: "rivers-line",
			type: "line",
			source: "rivers",
			layout: { "line-cap": "round", "line-join": "round" },
			paint: {
				"line-color": COLOR.water2,
				"line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.3, 4, 0.6, 7, 1, 10, 1.6],
				"line-opacity": 0.7,
			},
		},
		{
			id: "country-line",
			type: "line",
			source: "countries",
			filter: ["!=", ["get", "ISO_A3"], "ATA"],
			layout: {
				"line-join": "round",
				"line-cap": "round",
			},
			paint: {
				"line-color": lineColorExpression(null),
				// Scale border width with zoom — keeps the world view tidy
				// (thin hairlines) and gives proper visible borders when
				// zoomed in.
				"line-width": [
					"interpolate",
					["linear"],
					["zoom"],
					1,
					["case", ["boolean", ["feature-state", "hover"], false], 1.5, 0.4],
					4,
					["case", ["boolean", ["feature-state", "hover"], false], 2, 0.7],
					7,
					["case", ["boolean", ["feature-state", "hover"], false], 2.5, 1.2],
					10,
					["case", ["boolean", ["feature-state", "hover"], false], 3, 1.6],
				],
			},
		},
		{
			id: "city-circle",
			type: "circle",
			source: "cities",
			// Capital cities render as star icons via the DOM overlay (see
			// map-labels.tsx); filter them out of the circle layer so they
			// don't render as a dot underneath the star.
			filter: ["!=", ["get", "isCapital"], 1],
			paint: {
				// Radius interpolates with zoom AND with the city's pop bracket via
				// a step expression on properties.population. Cheap on the GPU; no
				// per-feature radius math up front.
				"circle-radius": [
					"interpolate",
					["linear"],
					["zoom"],
					1.5,
					["case", ["boolean", ["feature-state", "hover"], false], 2.5, 1.2],
					4,
					["case", ["boolean", ["feature-state", "hover"], false], 4.5, 2.5],
					7,
					["case", ["boolean", ["feature-state", "hover"], false], 6, 4],
					10,
					["case", ["boolean", ["feature-state", "hover"], false], 8.5, 6],
				],
				"circle-color": ["get", "ownerColor"],
				// Neutral cities fade in between zoom 2.8 and 3.2 — invisible at
				// world view, visible once you zoom in a little. Owned cities
				// stay at full opacity at every zoom.
				// MapLibre requires ["zoom"] at the top of an interpolate; the
				// per-feature owned/neutral case lives inside each stop instead.
				"circle-opacity": [
					"interpolate",
					["linear"],
					["zoom"],
					2.8,
					["case", ["==", ["get", "hasOwner"], 1], 1, 0],
					3.2,
					1,
				],
				// Stroke width is uniform across owned, allied, and foreign
				// cities so all dots read at the same physical size. Selection
				// state still inflates to 2.5 to highlight the click target.
				// Per-faction identity comes from circle-color, not stroke
				// width, so my own dots aren't visually larger than peers'.
				"circle-stroke-width": [
					"case",
					["boolean", ["feature-state", "selected"], false],
					2.5,
					0.6,
				],
				"circle-stroke-color": [
					"case",
					["boolean", ["feature-state", "selected"], false],
					CITY_SELECTED_RING,
					["==", ["get", "isMine"], 1],
					COLOR.signal500,
					COLOR.ink1,
				],
				"circle-stroke-opacity": [
					"interpolate",
					["linear"],
					["zoom"],
					2.8,
					["case", ["==", ["get", "hasOwner"], 1], 1, 0],
					3.2,
					1,
				],
			},
		},
		// Animated hover ring — a stroke-only circle drawn around the
		// hovered city. Visibility is gated via the `hover` feature-state
		// flag (0 opacity when not hovered) and the radius + stroke-opacity
		// pulse via setPaintProperty in a requestAnimationFrame loop while a
		// city is hovered. Transparent fill so it doesn't cover the dot.
		{
			id: "city-hover-ring",
			type: "circle",
			source: "cities",
			paint: {
				"circle-color": "rgba(0,0,0,0)",
				"circle-radius": [
					"interpolate",
					["linear"],
					["zoom"],
					1.5,
					["case", ["boolean", ["feature-state", "hover"], false], 4, 0],
					4,
					["case", ["boolean", ["feature-state", "hover"], false], 7, 0],
					7,
					["case", ["boolean", ["feature-state", "hover"], false], 9, 0],
					10,
					["case", ["boolean", ["feature-state", "hover"], false], 12, 0],
				],
				"circle-stroke-color": CITY_SELECTED_RING,
				"circle-stroke-width": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0],
				"circle-stroke-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.6, 0],
				// Smooth ease in/out on hover-enter / leave is configured via
				// setPaintProperty(`<prop>-transition`, …) after the layer is
				// created — those transition properties exist at runtime in
				// MapLibre but aren't in the strict paint-object types.
			},
		},
	],
};

export type CursorCoord = { lat: number; lng: number };
export type HoveredCountry = { iso3: string; iso2: string | null; name: string };
export type HoveredCity = { id: string; name: string };

/*
 * One row per playable city. Built in PlayPage from snapshot.cityState ⨯
 * world.cities ⨯ players. Passed here pre-computed so GameMap stays dumb.
 */
export type CityRender = {
	id: string;
	lng: number;
	lat: number;
	name: string;
	population: number;
	ownerColor: string | null;
	ownerName: string | null;
	isMine: boolean;
	/** Phase 6c: city is owned by an alliance co-member. Treated like
	 *  `isMine` for color purposes — keeps faction-team identity visible
	 *  on the map (allies render blue) instead of getting forced to grey. */
	isAlly: boolean;
	isCapital: boolean;
	countryCode: string;
};

export type GameMapProps = {
	onCursorMove?: (coord: CursorCoord | null) => void;
	onHoverCountry?: (country: HoveredCountry | null) => void;
	onHoverCity?: (city: HoveredCity | null) => void;
	onCityClick?: (cityId: string) => void;
	/** Fires on any click that didn't hit a city dot — country fills and
	 *  bare ocean alike. Used to clear the selected-city panel when the
	 *  player clicks away from the currently-selected city. */
	onDeselectCity?: () => void;
	myCountryCode?: string | null;
	/** Phase 6c: ISO3 codes of every country held by an alliance co-member.
	 *  Their fill + outline render in `ally500` blue and their city dots
	 *  override the per-faction `ownerColor` to the same blue. */
	alliedCountryCodes?: readonly string[];
	cities?: WorldDataset["cities"];
	/** World-data countries — used by the DOM label overlay to render
	 *  country names at low zoom and resolve display names. */
	countries?: WorldDataset["countries"];
	citiesRender?: CityRender[];
	selectedCityId?: string | null;
	onMapReady?: (api: {
		flyToCity: (cityId: string) => void;
		zoomIn: () => void;
		zoomOut: () => void;
	}) => void;
};

type CountryPopoverState = {
	iso3: string;
	iso2: string | null;
	name: string;
	x: number;
	y: number;
};

function fmt(n: number, dp = 3): string {
	return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

type MarkingTone = "default" | "signal" | "crit" | "warn" | "info";

const MARKING_TONE_CLASSES: Record<MarkingTone, string> = {
	default: "text-muted-foreground",
	signal: "text-primary",
	crit: "text-destructive",
	warn: "text-[var(--color-warn)]",
	info: "text-[var(--color-info)]",
};

/**
 * Single marking option in the right-click context menu's Markings
 * submenu. Renders a colored glyph + label. `onSelect` is a stub for now
 * (Phase 5/7 will wire up actual marking placement).
 *
 * IMPORTANT: returns a single `DropdownMenuItem` (no fragment wrapper) —
 * Radix's keyboard navigation only walks direct, recognized menu children
 * of `DropdownMenuContent` / `DropdownMenuSubContent`. Wrapping in a
 * fragment with sibling nodes breaks sub-menu behavior. Group headings
 * are rendered directly via `DropdownMenuLabel` at the call site.
 */
function MarkingItem({
	glyph,
	label,
	tone = "default",
}: {
	glyph: import("@/components/icons").UnitGlyph;
	label: string;
	tone?: MarkingTone;
}) {
	return (
		<DropdownMenuItem
			className="gap-2 font-mono text-[11px] uppercase tracking-[0.06em]"
			onSelect={() => {
				// Phase 5/7 hook: emit a marking event with current coord + glyph.
			}}
		>
			<UnitIcon glyph={glyph} size={14} className={`shrink-0 ${MARKING_TONE_CLASSES[tone]}`} />
			{label}
		</DropdownMenuItem>
	);
}

/**
 * Stat cell for the country popover. Two-column grid layout with mono
 * uppercase label + value below. `truncate` clamps long values (capital
 * names, owner names) so the cell doesn't wrap or overflow.
 */
function Stat({
	label,
	value,
	truncate,
}: {
	label: string;
	value: React.ReactNode;
	truncate?: boolean;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5 bg-card/95 px-3 py-2 font-mono">
			<span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
			<span className={`text-[12px] text-foreground tabular-nums ${truncate ? "truncate" : ""}`}>
				{value}
			</span>
		</div>
	);
}

function citiesToFeatureCollection(rows: CityRender[] | undefined): GeoJSON.FeatureCollection {
	if (!rows) return { type: "FeatureCollection", features: [] };
	return {
		type: "FeatureCollection",
		features: rows.map((c) => ({
			type: "Feature",
			id: c.id,
			geometry: { type: "Point", coordinates: [c.lng, c.lat] },
			properties: {
				cityId: c.id,
				name: c.name,
				population: c.population,
				// Color rule:
				//   - Owned by you → faction color (signal amber via ownerColor)
				//   - Owned by an alliance co-member → ally blue (caller passes
				//     the COLOR.ally500 value as ownerColor when isAlly is set)
				//   - Owned by anyone else → neutral grey
				//   - Unowned → neutral grey
				// Faction identity for non-allied foreigners surfaces via the
				// popover + sidebar instead of bleeding onto the map.
				ownerColor: (c.isMine || c.isAlly) && c.ownerColor ? c.ownerColor : CITY_NEUTRAL_COLOR,
				isMine: c.isMine ? 1 : 0,
				// Used by the city-circle filter to suppress dots for
				// capitals — they render as star icons via the DOM overlay
				// instead.
				isCapital: c.isCapital ? 1 : 0,
				// Foreign-owned cities still count as "has owner" for the
				// opacity fade-in — they stay visible at world zoom so the
				// player can see other powers' territory at a glance.
				hasOwner: c.ownerColor ? 1 : 0,
			},
		})),
	};
}

export function GameMap({
	onCursorMove,
	onHoverCountry,
	onHoverCity,
	onCityClick,
	myCountryCode,
	alliedCountryCodes,
	onDeselectCity,
	cities,
	countries,
	citiesRender,
	selectedCityId,
	onMapReady,
}: GameMapProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<MapInstance | null>(null);
	const hoverIdRef = useRef<number | null>(null);
	const hoverCityIdRef = useRef<string | null>(null);
	const clickAudioRef = useRef<HTMLAudioElement | null>(null);
	const myCountryCodeRef = useRef<string | null | undefined>(myCountryCode);
	myCountryCodeRef.current = myCountryCode;
	const onDeselectCityRef = useRef<(() => void) | undefined>(onDeselectCity);
	onDeselectCityRef.current = onDeselectCity;
	const [mapReadyState, setMapReadyState] = useState<MapInstance | null>(null);
	const [contextCoord, setContextCoord] = useState<{
		lat: number;
		lng: number;
		iso3: string | null;
		name: string | null;
	} | null>(null);
	const [popover, setPopover] = useState<CountryPopoverState | null>(null);
	const [cityPopover, setCityPopover] = useState<{
		city: CityRender;
		x: number;
		y: number;
	} | null>(null);
	const [mapMenu, setMapMenu] = useState<{ open: boolean; clientX: number; clientY: number }>({
		open: false,
		clientX: 0,
		clientY: 0,
	});

	// Index country stats by ISO_A3 / ADM0_A3 once per cities-prop update so
	// the popover doesn't iterate the whole list on every click. Captures
	// counts the popover surfaces directly (cities, ports, total population)
	// plus the capital name.
	const cityStatsByCountry = useMemo(() => {
		const map = new Map<
			string,
			{
				cityCount: number;
				capital: string | null;
				totalPopulation: number;
				portCount: number;
			}
		>();
		if (!cities) return map;
		for (const c of cities) {
			const stat = map.get(c.countryCode) ?? {
				cityCount: 0,
				capital: null,
				totalPopulation: 0,
				portCount: 0,
			};
			stat.cityCount++;
			stat.totalPopulation += c.basePopulation;
			if (c.isCoastal) stat.portCount++;
			if (c.isCapital && !stat.capital) stat.capital = c.name;
			map.set(c.countryCode, stat);
		}
		return map;
	}, [cities]);

	// Country-level facts (playable / landlocked) keyed by ISO3 — separate
	// index because cities don't carry these flags.
	const countryFactsByIso3 = useMemo(() => {
		const map = new Map<string, { name: string; isPlayable: boolean; isLandlocked: boolean }>();
		if (!cities) return map;
		// Country list is on the WorldDataset alongside cities, but here we only
		// receive cities — so we derive what we can. Decoration vs playable comes
		// from the city stats (country has no playable cities iff isPlayable is
		// false in the worldgen output, but we don't see the flag here). Leave
		// the lookup empty and let the popover treat playability as unknown.
		return map;
	}, [cities]);

	// Find the owner player for a country if any of its cities is owned by a
	// known player (ownerColor + ownerName populated). Return the first hit.
	const ownerByCountry = useMemo(() => {
		const map = new Map<string, { color: string; name: string }>();
		if (!citiesRender) return map;
		for (const c of citiesRender) {
			if (c.ownerColor && c.ownerName && !map.has(c.countryCode)) {
				map.set(c.countryCode, { color: c.ownerColor, name: c.ownerName });
			}
		}
		return map;
	}, [citiesRender]);

	// Suppress unused — kept for forward compat when country flags surface.
	void countryFactsByIso3;

	// Lookup index for the city popover: O(1) by id from the click handler.
	const cityById = useMemo(() => {
		const map = new Map<string, CityRender>();
		if (!citiesRender) return map;
		for (const c of citiesRender) map.set(c.id, c);
		return map;
	}, [citiesRender]);

	const styleSpec = useMemo(() => STYLE, []);

	// Lazy-init the click SFX once on mount so we reuse the same Audio
	// element across clicks (cheap to rewind via currentTime reset).
	useEffect(() => {
		const a = new Audio("/sfx/map-click.mp3");
		a.preload = "auto";
		a.volume = 0.6;
		clickAudioRef.current = a;
		return () => {
			a.pause();
			clickAudioRef.current = null;
		};
	}, []);

	const syncContextMenuCoords = useCallback(
		(pointPx: [number, number], lngLat: { lat: number; lng: number }) => {
			const map = mapRef.current;
			if (!map) return;
			const features = map.queryRenderedFeatures(pointPx, { layers: ["country-fill"] });
			const props = features[0]?.properties ?? null;
			setContextCoord({
				lat: lngLat.lat,
				lng: lngLat.lng,
				iso3: (props?.ISO_A3 as string) ?? (props?.ADM0_A3 as string) ?? null,
				name: (props?.NAME as string) ?? (props?.ADMIN as string) ?? null,
			});
		},
		[],
	);

	const copyLatLng = useCallback(() => {
		if (!contextCoord) return;
		void navigator.clipboard?.writeText(`${fmt(contextCoord.lat, 6)}, ${fmt(contextCoord.lng, 6)}`);
	}, [contextCoord]);

	const copyCountry = useCallback(() => {
		if (!contextCoord?.iso3) return;
		void navigator.clipboard?.writeText(contextCoord.iso3);
	}, [contextCoord]);

	useEffect(() => {
		if (!containerRef.current) return;

		const map = new maplibregl.Map({
			container: containerRef.current,
			style: styleSpec,
			// Center shifted up to lat=32 so the populated landmass is
			// vertically centered now that the south-mask hides everything
			// below -55°.
			center: [15, 32],
			zoom: 2,
			// minZoom raised slightly so the user can't zoom out far enough
			// that the masked southern band dominates the viewport.
			// NOTE: do NOT combine with `maxBounds` — that conflicts with
			// `renderWorldCopies: true` and freezes the map.
			minZoom: 1.7,
			maxZoom: 10,
			renderWorldCopies: true,
			attributionControl: false,
			// Default MapLibre binds right-drag (and ctrl+left) to bearing rotation;
			// keep north-up HUD and reserve right-click for the context menu only.
			dragRotate: false,
			// Crisper borders on retina/high-DPI displays.
			pixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
			fadeDuration: 100,
		});
		// Force a resize once layout has settled — MapLibre captures the
		// container size at construction and a 0-size container produces a
		// black canvas that never recovers without an explicit resize.
		requestAnimationFrame(() => map.resize());
		const ro = new ResizeObserver(() => map.resize());
		ro.observe(containerRef.current);
		// Natural Earth attribution lives in packages/world-data/CREDITS.md
		// per CC-BY 4.0; the on-map label is removed for HUD cleanliness.
		mapRef.current = map;
		// Surface the map instance to React state so DOM-overlay siblings
		// (MapLabels) re-render once the canvas is ready.
		setMapReadyState(map);

		map.on("mousemove", "country-fill", (e) => {
			const f = e.features?.[0];
			if (!f) return;
			if (hoverIdRef.current !== null && hoverIdRef.current !== f.id) {
				map.setFeatureState({ source: "countries", id: hoverIdRef.current }, { hover: false });
			}
			hoverIdRef.current = (f.id as number) ?? null;
			if (hoverIdRef.current !== null) {
				map.setFeatureState({ source: "countries", id: hoverIdRef.current }, { hover: true });
			}
			const props = f.properties ?? {};
			const iso2Raw =
				(props.ISO_A2_EH as string | undefined) ?? (props.ISO_A2 as string | undefined);
			onHoverCountry?.({
				iso3: (props.ISO_A3 as string) ?? (props.ADM0_A3 as string) ?? "",
				iso2: iso2Raw && iso2Raw !== "-99" ? iso2Raw.toLowerCase() : null,
				name: (props.NAME as string) ?? (props.ADMIN as string) ?? "",
			});
		});
		map.on("mouseleave", "country-fill", () => {
			if (hoverIdRef.current !== null) {
				map.setFeatureState({ source: "countries", id: hoverIdRef.current }, { hover: false });
				hoverIdRef.current = null;
			}
		});

		map.on("click", "country-fill", (e) => {
			// City sprite click wins over the country underneath. The city
			// handler ran first and tagged the original event; bail here.
			if ((e.originalEvent as MouseEvent & { _cityHandled?: boolean })._cityHandled) {
				return;
			}
			// Click landed on a country, not a city — deselect the city panel
			// if anything was selected.
			onDeselectCityRef.current?.();
			const f = e.features?.[0];
			const props = f?.properties ?? {};
			const iso3 = (props.ISO_A3 as string) ?? (props.ADM0_A3 as string) ?? "";
			// Suppress the country popover on the player's own country —
			// they pick cities through the sidebar / sprites, not the country.
			if (iso3 && myCountryCodeRef.current && iso3 === myCountryCodeRef.current) {
				setPopover(null);
				return;
			}
			const audio = clickAudioRef.current;
			if (audio) {
				audio.currentTime = 0;
				void audio.play().catch(() => {
					// Browsers block autoplay until the user has interacted
					// with the page. A click on the map IS that interaction,
					// but fail quietly on edge-case races.
				});
			}
			if (!iso3) {
				setPopover(null);
				return;
			}
			const iso2Raw =
				(props.ISO_A2_EH as string | undefined) ?? (props.ISO_A2 as string | undefined);
			setPopover({
				iso3,
				iso2: iso2Raw && iso2Raw !== "-99" ? iso2Raw.toLowerCase() : null,
				name: (props.NAME as string) ?? (props.ADMIN as string) ?? iso3,
				x: e.point.x,
				y: e.point.y,
			});
			setCityPopover(null);
		});

		// Catch-all click handler for ocean / map background. The country-fill
		// and city-circle handlers fire first via layer-specific listeners; if
		// neither tagged the event, the click hit water or unmapped land and
		// we treat it as a click-away → deselect any selected city + close any
		// open popovers.
		map.on("click", (e) => {
			const ev = e.originalEvent as MouseEvent & {
				_cityHandled?: boolean;
				_countryHandled?: boolean;
			};
			if (ev._cityHandled) return;
			// country-fill handler always fires when over land, so reaching here
			// means we're on water.
			const features = map.queryRenderedFeatures(e.point, {
				layers: ["country-fill", "city-circle"],
			});
			if (features.length === 0) {
				onDeselectCityRef.current?.();
				setPopover(null);
				setCityPopover(null);
			}
		});

		map.on("mousemove", (e) => onCursorMove?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));

		const onMapContextMenu = (e: maplibregl.MapMouseEvent) => {
			syncContextMenuCoords([e.point.x, e.point.y], e.lngLat);
			const { clientX, clientY } = e.originalEvent;
			setMapMenu({ open: true, clientX, clientY });
		};
		map.on("contextmenu", onMapContextMenu);

		return () => {
			map.off("contextmenu", onMapContextMenu);
			ro.disconnect();
			map.remove();
			mapRef.current = null;
			setMapReadyState(null);
		};
	}, [styleSpec, onCursorMove, onHoverCountry, syncContextMenuCoords]);

	// Re-apply paint properties whenever the player's country or the allied
	// set changes so owned country lights up in amber and alliance peers
	// render in blue. Waits for the style to load the first time, then
	// mutates the paint expressions in place. The caller is expected to
	// memoize `alliedCountryCodes` so a stable reference avoids re-running
	// this on unrelated re-renders.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const apply = () => {
			map.setPaintProperty(
				"country-fill",
				"fill-color",
				fillExpression(myCountryCode, alliedCountryCodes),
			);
			map.setPaintProperty(
				"country-line",
				"line-color",
				lineColorExpression(myCountryCode, alliedCountryCodes),
			);
		};
		if (map.isStyleLoaded()) {
			apply();
		} else {
			map.once("load", apply);
		}
	}, [myCountryCode, alliedCountryCodes]);

	// Push city geojson into the source whenever ownership / cities change.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const fc = citiesToFeatureCollection(citiesRender);
		const apply = () => {
			const src = map.getSource("cities") as maplibregl.GeoJSONSource | undefined;
			src?.setData(fc);
		};
		if (map.isStyleLoaded()) apply();
		else map.once("load", apply);
	}, [citiesRender]);

	// Wire one-time click/hover handlers for the city layer. Re-bind when the
	// callback identities change so closures see fresh refs.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const onClick = (
			e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
		) => {
			const f = e.features?.[0];
			const id = (f?.properties?.cityId as string | undefined) ?? null;
			if (id) {
				onCityClick?.(id);
				const city = cityById.get(id);
				if (city) {
					setCityPopover({ city, x: e.point.x, y: e.point.y });
					setPopover(null);
				}
				// MapLibre fires layer-specific click handlers in the order they
				// were registered, not by render order. Mark the event so the
				// country-fill handler below can detect + bail.
				(e.originalEvent as MouseEvent & { _cityHandled?: boolean })._cityHandled = true;
			}
		};
		map.on("click", "city-circle", onClick);
		return () => {
			map.off("click", "city-circle", onClick);
		};
	}, [onCityClick, cityById]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const onMove = (
			e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
		) => {
			const f = e.features?.[0];
			const id = (f?.properties?.cityId as string | undefined) ?? null;
			if (hoverCityIdRef.current && hoverCityIdRef.current !== id) {
				map.setFeatureState({ source: "cities", id: hoverCityIdRef.current }, { hover: false });
			}
			if (id && id !== hoverCityIdRef.current) {
				map.setFeatureState({ source: "cities", id }, { hover: true });
			}
			hoverCityIdRef.current = id;
			map.getCanvas().style.cursor = id ? "pointer" : "";
			onHoverCity?.(id ? { id, name: (f?.properties?.name as string) ?? "" } : null);
		};
		const onLeave = () => {
			if (hoverCityIdRef.current) {
				map.setFeatureState({ source: "cities", id: hoverCityIdRef.current }, { hover: false });
				hoverCityIdRef.current = null;
			}
			map.getCanvas().style.cursor = "";
			onHoverCity?.(null);
		};
		map.on("mousemove", "city-circle", onMove);
		map.on("mouseleave", "city-circle", onLeave);
		return () => {
			map.off("mousemove", "city-circle", onMove);
			map.off("mouseleave", "city-circle", onLeave);
		};
	}, [onHoverCity]);

	// Pulse animation for the city-hover-ring layer. While any city is
	// hovered, oscillate the layer-level circle-radius and
	// circle-stroke-opacity via a sin wave so the ring "breathes" — drawing
	// the eye and signaling clickability. Stops when no city is hovered so
	// MapLibre isn't repainting needlessly.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const PERIOD_MS = 1800;
		let raf: number | null = null;
		let lastHoverId: string | null = null;

		const setBaseRadius = () => {
			map.setPaintProperty("city-hover-ring", "circle-radius", [
				"interpolate",
				["linear"],
				["zoom"],
				1.5,
				["case", ["boolean", ["feature-state", "hover"], false], 4, 0],
				4,
				["case", ["boolean", ["feature-state", "hover"], false], 7, 0],
				7,
				["case", ["boolean", ["feature-state", "hover"], false], 9, 0],
				10,
				["case", ["boolean", ["feature-state", "hover"], false], 12, 0],
			]);
		};

		const tick = () => {
			const id = hoverCityIdRef.current;
			if (id) {
				const t = (performance.now() % PERIOD_MS) / PERIOD_MS; // 0..1
				const phase = (Math.sin(t * Math.PI * 2) + 1) / 2; // 0..1
				// Subtle pulse: ~2px breath, 0.5..0.7 opacity. Just enough to
				// draw the eye without becoming a fidget toy.
				const radiusBoost = phase * 2; // 0..2px outward
				const opacity = 0.5 + phase * 0.2; // 0.50..0.70
				try {
					map.setPaintProperty("city-hover-ring", "circle-radius", [
						"interpolate",
						["linear"],
						["zoom"],
						1.5,
						["case", ["boolean", ["feature-state", "hover"], false], 4 + radiusBoost, 0],
						4,
						["case", ["boolean", ["feature-state", "hover"], false], 7 + radiusBoost, 0],
						7,
						["case", ["boolean", ["feature-state", "hover"], false], 9 + radiusBoost, 0],
						10,
						["case", ["boolean", ["feature-state", "hover"], false], 12 + radiusBoost, 0],
					]);
					map.setPaintProperty("city-hover-ring", "circle-stroke-opacity", [
						"case",
						["boolean", ["feature-state", "hover"], false],
						opacity,
						0,
					]);
				} catch {
					// Layer not ready yet (style still loading) — try again next frame.
				}
				lastHoverId = id;
			} else if (lastHoverId !== null) {
				// Cursor just left a city — settle the ring back to its base size
				// (the layer's static expression handles fading via transitions).
				try {
					setBaseRadius();
					map.setPaintProperty("city-hover-ring", "circle-stroke-opacity", [
						"case",
						["boolean", ["feature-state", "hover"], false],
						0.6,
						0,
					]);
				} catch {
					// noop
				}
				lastHoverId = null;
			}
			raf = requestAnimationFrame(tick);
		};

		// Wait for style to load before driving paint properties.
		const start = () => {
			// Configure ease-in / ease-out for the static (non-RAF) value
			// transitions so hover-enter / hover-leave fade smoothly. These
			// properties exist on MapLibre at runtime but aren't in the
			// strict paint-object types — set via the runtime API instead.
			try {
				(
					map as unknown as {
						setPaintProperty: (l: string, p: string, v: unknown) => void;
					}
				).setPaintProperty("city-hover-ring", "circle-radius-transition", {
					duration: 200,
					delay: 0,
				});
				(
					map as unknown as {
						setPaintProperty: (l: string, p: string, v: unknown) => void;
					}
				).setPaintProperty("city-hover-ring", "circle-stroke-opacity-transition", {
					duration: 200,
					delay: 0,
				});
			} catch {
				// noop
			}
			raf = requestAnimationFrame(tick);
		};
		if (map.isStyleLoaded()) start();
		else map.once("load", start);

		return () => {
			if (raf !== null) cancelAnimationFrame(raf);
		};
	}, []);

	// Selected-city ring via feature-state. Track the previously-selected id
	// in a ref so we can clear it without snapshotting external state.
	const prevSelectedRef = useRef<string | null>(null);
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const apply = () => {
			if (prevSelectedRef.current && prevSelectedRef.current !== selectedCityId) {
				map.setFeatureState({ source: "cities", id: prevSelectedRef.current }, { selected: false });
			}
			if (selectedCityId) {
				map.setFeatureState({ source: "cities", id: selectedCityId }, { selected: true });
			}
			prevSelectedRef.current = selectedCityId ?? null;
		};
		if (map.isStyleLoaded()) apply();
		else map.once("load", apply);
	}, [selectedCityId]);

	// Expose flyToCity + zoom so PlayPage can pan the map when the user clicks
	// a city in the sidebar list, and so the zoom buttons can live in the page's
	// panel-aware HUD layer (rather than under the right panel).
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !onMapReady) return;
		onMapReady({
			flyToCity: (cityId: string) => {
				const c = citiesRender?.find((row) => row.id === cityId);
				if (!c) return;
				map.flyTo({ center: [c.lng, c.lat], zoom: Math.max(map.getZoom(), 4.5), duration: 600 });
			},
			zoomIn: () => map.zoomIn(),
			zoomOut: () => map.zoomOut(),
		});
	}, [citiesRender, onMapReady]);

	const popoverStats = popover
		? (cityStatsByCountry.get(popover.iso3) ??
			cityStatsByCountry.get(popover.iso3.toUpperCase()) ??
			null)
		: null;

	return (
		<>
			<div className="absolute inset-0" style={{ position: "absolute", inset: 0 }}>
				<div
					ref={containerRef}
					style={{ width: "100%", height: "100%" }}
					className="h-full w-full"
				/>
				<MapLabels
					map={mapReadyState}
					cities={cities}
					countries={countries}
					citiesRender={citiesRender}
					onCityClick={onCityClick}
				/>
			</div>

			<DropdownMenu
				open={mapMenu.open}
				onOpenChange={(open) => {
					if (!open) setMapMenu((s) => ({ ...s, open: false }));
				}}
			>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						tabIndex={-1}
						aria-hidden
						className="pointer-events-none fixed z-10 h-px w-px border-0 p-0 opacity-0"
						style={{ left: mapMenu.clientX, top: mapMenu.clientY }}
					/>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					className="min-w-[13rem] border-border bg-popover/95 p-1 font-mono text-xs backdrop-blur-sm"
					align="start"
					side="bottom"
					sideOffset={4}
					onCloseAutoFocus={(e) => e.preventDefault()}
				>
					{/* Header — Radix counts DropdownMenuLabel as a recognized
					    direct child of DropdownMenuContent, so the keyboard nav
					    + sub-menu detection still work (a wrapping <div> breaks
					    them). Flag inline at left when over a country. */}
					<DropdownMenuLabel className="px-2 py-1.5">
						<div className="flex items-center gap-2">
							{contextCoord?.iso3
								? (() => {
										const iso2 = alpha3ToAlpha2(contextCoord.iso3);
										return iso2 ? (
											<Image
												src={`https://flagcdn.com/w40/${iso2}.png`}
												alt=""
												width={20}
												height={14}
												unoptimized
												className="h-3.5 w-5 flex-shrink-0 border border-border object-cover"
											/>
										) : null;
									})()
								: null}
							<div className="flex min-w-0 flex-col gap-0.5">
								<span className="font-mono text-[9px] font-normal uppercase tracking-[0.22em] text-muted-foreground">
									{contextCoord?.iso3 ? "Sector" : "Open Ocean"}
								</span>
								{contextCoord?.name && (
									<span className="truncate font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-foreground">
										{contextCoord.name}
										<span className="ml-1 text-muted-foreground">· {contextCoord.iso3}</span>
									</span>
								)}
							</div>
						</div>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />

					{/* Markings submenu */}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger
							className="gap-2 font-mono text-[11px] uppercase tracking-[0.06em]"
							disabled={!contextCoord}
						>
							<UnitIcon glyph="scope" size={14} className="shrink-0" />
							Markings
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent
							className="min-w-[13rem] border-border bg-popover/95 p-1 font-mono backdrop-blur-sm"
							sideOffset={4}
						>
							<DropdownMenuLabel className="px-2 py-1 font-mono text-[9px] font-normal uppercase tracking-[0.22em] text-muted-foreground/70">
								Sightings
							</DropdownMenuLabel>
							<MarkingItem glyph="spy" label="Enemy unit" tone="crit" />
							<MarkingItem glyph="recon" label="Friendly unit" tone="signal" />
							<MarkingItem glyph="convoy" label="Convoy" />
							<MarkingItem glyph="air" label="Air patrol" tone="info" />
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="px-2 py-1 font-mono text-[9px] font-normal uppercase tracking-[0.22em] text-muted-foreground/70">
								Vectors
							</DropdownMenuLabel>
							<MarkingItem glyph="missile" label="Attack line" tone="crit" />
							<MarkingItem glyph="recon" label="Retreat path" tone="warn" />
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="px-2 py-1 font-mono text-[9px] font-normal uppercase tracking-[0.22em] text-muted-foreground/70">
								Positions
							</DropdownMenuLabel>
							<MarkingItem glyph="radar" label="Outpost" />
							<MarkingItem glyph="hq" label="Forward HQ" tone="signal" />
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					{/* Message nation — stub. Flag inline so the player sees who
					    they're contacting before the actual flow exists. */}
					<DropdownMenuItem
						className="gap-2 font-mono text-[11px] uppercase tracking-[0.06em]"
						disabled={!contextCoord?.iso3}
						onSelect={() => {
							// Phase 6 will wire up the actual messaging flow.
						}}
					>
						<UnitIcon glyph="treaty" size={14} className="shrink-0" />
						<span>Message</span>
						{contextCoord?.iso3
							? (() => {
									const iso2 = alpha3ToAlpha2(contextCoord.iso3);
									return iso2 ? (
										<Image
											src={`https://flagcdn.com/w40/${iso2}.png`}
											alt=""
											width={16}
											height={12}
											unoptimized
											className="h-3 w-4 flex-shrink-0 border border-border object-cover"
										/>
									) : null;
								})()
							: null}
						<span>{contextCoord?.iso3 ?? "nation"}</span>
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					{/* Compact copy actions */}
					<DropdownMenuItem
						className="gap-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
						onSelect={copyLatLng}
						disabled={!contextCoord}
					>
						<Copy className="size-3 shrink-0" />
						Copy coords
						{contextCoord && (
							<DropdownMenuShortcut className="text-[9px]">
								{fmt(contextCoord.lat, 1)}, {fmt(contextCoord.lng, 1)}
							</DropdownMenuShortcut>
						)}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="gap-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
						onSelect={copyCountry}
						disabled={!contextCoord?.iso3}
					>
						<Copy className="size-3 shrink-0" />
						Copy ISO
						{contextCoord?.iso3 && (
							<DropdownMenuShortcut className="text-[9px]">
								{contextCoord.iso3}
							</DropdownMenuShortcut>
						)}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{popover && (
				<Popover open onOpenChange={(o) => !o && setPopover(null)}>
					<PopoverTrigger asChild>
						<div
							aria-hidden
							style={{
								position: "absolute",
								left: popover.x,
								top: popover.y,
								width: 1,
								height: 1,
								pointerEvents: "none",
							}}
						/>
					</PopoverTrigger>
					<PopoverContent
						side="top"
						sideOffset={12}
						align="center"
						className="w-72 border border-border bg-card/95 p-0 backdrop-blur-sm"
					>
						{(() => {
							const faction = factionForCountry(popover.iso3);
							const owner = ownerByCountry.get(popover.iso3);
							const isClaimed = !!owner;
							return (
								<>
									{/* Type stripe — amber/signal for nation-level intel */}
									<div className="flex items-center justify-between border-b border-primary/40 bg-primary/10 px-3 py-1">
										<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-primary">
											◆ Nation
										</span>
										<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
											{popover.iso3}
										</span>
									</div>

									{/* Head: flag-led — the country IS its flag */}
									<div className="flex items-center gap-3 px-3 py-2.5">
										{popover.iso2 ? (
											<Image
												src={`https://flagcdn.com/w80/${popover.iso2}.png`}
												alt=""
												width={48}
												height={32}
												unoptimized
												className="h-8 w-12 flex-shrink-0 border border-border object-cover"
											/>
										) : (
											<div className="h-8 w-12 flex-shrink-0 border border-border bg-muted" />
										)}
										<div className="flex min-w-0 flex-col gap-0.5">
											<span className="truncate font-medium text-foreground text-base">
												{popover.name}
											</span>
											<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
												{faction ? faction.replace("_", "-") : "—"}
											</span>
										</div>
									</div>

									{/* Status badge row */}
									<div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
										<Badge variant="ok" dot>
											At Peace
										</Badge>
										{isClaimed ? (
											<Badge variant="signal" dot>
												Claimed
											</Badge>
										) : (
											<Badge variant="default" dot>
												Unclaimed
											</Badge>
										)}
										{popoverStats?.portCount && popoverStats.portCount > 0 ? (
											<Badge variant="info">Coastal</Badge>
										) : (
											<Badge variant="default">Landlocked</Badge>
										)}
									</div>

									{/* Stats grid: population + cities + capital + ports + owner */}
									<div className="grid grid-cols-2 gap-px border-t border-border bg-border">
										<Stat
											label="Population"
											value={popoverStats ? popoverStats.totalPopulation.toLocaleString() : "—"}
										/>
										<Stat label="Cities" value={popoverStats?.cityCount ?? "—"} />
										<Stat label="Capital" value={popoverStats?.capital ?? "—"} truncate />
										<Stat label="Ports" value={popoverStats?.portCount ?? 0} />
										<Stat
											label="Owner"
											value={
												owner ? (
													<span className="inline-flex items-center gap-1.5">
														<span
															aria-hidden
															className="inline-block size-2 flex-shrink-0"
															style={{ backgroundColor: owner.color }}
														/>
														<span className="truncate">{owner.name}</span>
													</span>
												) : (
													"Neutral"
												)
											}
											truncate
										/>
										<Stat
											label="Faction"
											value={faction ? faction.replace("_", "-").toUpperCase() : "—"}
										/>
									</div>
								</>
							);
						})()}
					</PopoverContent>
				</Popover>
			)}

			{cityPopover && (
				<Popover open onOpenChange={(o) => !o && setCityPopover(null)}>
					<PopoverTrigger asChild>
						<div
							aria-hidden
							style={{
								position: "absolute",
								left: cityPopover.x,
								top: cityPopover.y,
								width: 1,
								height: 1,
								pointerEvents: "none",
							}}
						/>
					</PopoverTrigger>
					<PopoverContent
						side="top"
						sideOffset={12}
						align="center"
						className="w-64 border border-border bg-card/95 p-0 backdrop-blur-sm"
					>
						{(() => {
							const city = cityPopover.city;
							const iso3 = city.countryCode;
							const iso2 = alpha3ToAlpha2(iso3);
							const def = cities?.find((c) => c.id === city.id);
							const faction = factionForCountry(iso3);
							const isMine = city.isMine;
							const isForeign = !!city.ownerName && !isMine;
							const isCoastal = !!def?.isCoastal;
							return (
								<>
									{/* Type stripe — info/blue for point-target city intel */}
									<div className="flex items-center justify-between border-b border-[var(--color-info)]/40 bg-[var(--color-info)]/10 px-3 py-1">
										<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-info)]">
											▣ City
										</span>
										<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
											{city.lat.toFixed(2)}°, {city.lng.toFixed(2)}°
										</span>
									</div>

									{/* Head: glyph-led — the city IS a focal point, not a flag.
									    Capital cities get the capital glyph in primary; everything
									    else gets the city glyph in muted. */}
									<div className="flex items-center gap-3 px-3 py-2.5">
										<div
											className={`flex size-10 flex-shrink-0 items-center justify-center border ${
												city.isCapital
													? "border-primary/60 bg-primary/10 text-primary"
													: "border-border bg-card text-muted-foreground"
											}`}
										>
											<UnitIcon
												glyph={city.isCapital ? "capital" : "city"}
												size={22}
												strokeWidth={1.5}
											/>
										</div>
										<div className="flex min-w-0 flex-col gap-0.5">
											<span className="truncate font-medium text-foreground text-base">
												{city.name}
											</span>
											<span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
												{iso2 ? (
													<Image
														src={`https://flagcdn.com/w40/${iso2}.png`}
														alt=""
														width={16}
														height={12}
														unoptimized
														className="h-3 w-4 flex-shrink-0 border border-border object-cover"
													/>
												) : null}
												<span className="truncate">
													{iso3}
													{faction ? ` · ${faction.replace("_", "-")}` : ""}
												</span>
											</span>
										</div>
									</div>

									{/* Status badge row */}
									<div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
										<Badge variant="ok" dot>
											At Peace
										</Badge>
										{city.isCapital ? (
											<Badge variant="signal">Capital</Badge>
										) : (
											<Badge variant="default">Core</Badge>
										)}
										{isCoastal ? (
											<Badge variant="info">Port</Badge>
										) : (
											<Badge variant="default">Inland</Badge>
										)}
										{isMine ? (
											<Badge variant="signal" dot>
												Yours
											</Badge>
										) : isForeign ? (
											<Badge variant="crit" dot>
												Foreign
											</Badge>
										) : (
											<Badge variant="default" dot>
												Neutral
											</Badge>
										)}
									</div>

									{/* Stats grid: population + owner */}
									<div className="grid grid-cols-2 gap-px border-t border-border bg-border">
										<Stat label="Population" value={city.population.toLocaleString()} />
										<Stat
											label="Owner"
											value={
												city.ownerName ? (
													<span className="inline-flex items-center gap-1.5">
														{city.ownerColor && (
															<span
																aria-hidden
																className="inline-block size-2 flex-shrink-0"
																style={{ backgroundColor: city.ownerColor }}
															/>
														)}
														<span className="truncate">{city.ownerName}</span>
													</span>
												) : (
													"Neutral"
												)
											}
											truncate
										/>
									</div>

									<div className="border-t border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
										Detail panel open in sidebar →
									</div>
								</>
							);
						})()}
					</PopoverContent>
				</Popover>
			)}
		</>
	);
}
