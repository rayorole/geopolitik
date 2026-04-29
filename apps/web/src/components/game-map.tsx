"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WorldDataset } from "@geopolitik/shared/api";
import { Copy, ZoomIn, ZoomOut } from "lucide-react";
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
	ink1: "#0a0e14", // background canvas
	ink3: "#1a212c", // country fill (default)
	ink5: "#34404f", // country outline
	signal500: "#d68b3e", // sodium-vapor amber, full opacity
	signal500a18: "rgba(214, 139, 62, 0.22)", // hover fill
	signal500a40: "rgba(214, 139, 62, 0.45)", // owned-country fill
} as const;

const CITY_NEUTRAL_COLOR = "#4a5666";
const CITY_SELECTED_RING = "#ffe082";

const NEVER_MATCH = "__NONE__";

function fillExpression(
	myCountryCode: string | null | undefined,
): maplibregl.DataDrivenPropertyValueSpecification<string> {
	const code = myCountryCode ?? NEVER_MATCH;
	return [
		"case",
		["any", ["==", ["get", "ISO_A3"], code], ["==", ["get", "ADM0_A3"], code]],
		COLOR.signal500a40,
		["boolean", ["feature-state", "hover"], false],
		COLOR.signal500a18,
		COLOR.ink3,
	] as maplibregl.DataDrivenPropertyValueSpecification<string>;
}

function lineColorExpression(
	myCountryCode: string | null | undefined,
): maplibregl.DataDrivenPropertyValueSpecification<string> {
	const code = myCountryCode ?? NEVER_MATCH;
	return [
		"case",
		["any", ["==", ["get", "ISO_A3"], code], ["==", ["get", "ADM0_A3"], code]],
		COLOR.signal500,
		["boolean", ["feature-state", "hover"], false],
		COLOR.signal500,
		COLOR.ink5,
	] as maplibregl.DataDrivenPropertyValueSpecification<string>;
}

const STYLE: maplibregl.StyleSpecification = {
	version: 8,
	sources: {
		countries: {
			type: "geojson",
			data: "/world-countries.geojson",
			generateId: true,
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
			paint: {
				// Radius interpolates with zoom AND with the city's pop bracket via
				// a step expression on properties.population. Cheap on the GPU; no
				// per-feature radius math up front.
				"circle-radius": [
					"interpolate",
					["linear"],
					["zoom"],
					1.5,
					["case", ["boolean", ["feature-state", "hover"], false], 4.5, 2],
					4,
					["case", ["boolean", ["feature-state", "hover"], false], 7, 4],
					7,
					["case", ["boolean", ["feature-state", "hover"], false], 10, 7],
					10,
					["case", ["boolean", ["feature-state", "hover"], false], 13, 10],
				],
				"circle-color": ["get", "ownerColor"],
				"circle-stroke-width": [
					"case",
					["boolean", ["feature-state", "selected"], false],
					2.5,
					["==", ["get", "isMine"], 1],
					1.4,
					0.6,
				],
				"circle-stroke-color": [
					"case",
					["boolean", ["feature-state", "selected"], false],
					CITY_SELECTED_RING,
					["==", ["get", "isMine"], 1],
					COLOR.signal500,
					"#0a0e14",
				],
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
	isCapital: boolean;
	countryCode: string;
};

export type GameMapProps = {
	onCursorMove?: (coord: CursorCoord | null) => void;
	onHoverCountry?: (country: HoveredCountry | null) => void;
	onHoverCity?: (city: HoveredCity | null) => void;
	onCityClick?: (cityId: string) => void;
	myCountryCode?: string | null;
	cities?: WorldDataset["cities"];
	citiesRender?: CityRender[];
	selectedCityId?: string | null;
	onMapReady?: (api: { flyToCity: (cityId: string) => void }) => void;
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
				ownerColor: c.ownerColor ?? CITY_NEUTRAL_COLOR,
				isMine: c.isMine ? 1 : 0,
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
	cities,
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

	// Index city stats by ISO_A3 / ADM0_A3 once per cities-prop update so the
	// popover doesn't iterate the whole list on every click.
	const cityStatsByCountry = useMemo(() => {
		const map = new Map<string, { cityCount: number; capital: string | null }>();
		if (!cities) return map;
		for (const c of cities) {
			const stat = map.get(c.countryCode) ?? { cityCount: 0, capital: null };
			stat.cityCount++;
			if (c.isCapital && !stat.capital) stat.capital = c.name;
			map.set(c.countryCode, stat);
		}
		return map;
	}, [cities]);

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
			// Center on the geographical centroid of the populated landmass
			// (now that Antarctica is hidden) so the world view doesn't leave
			// a dead band of ocean at the bottom.
			center: [15, 25],
			zoom: 1.8,
			minZoom: 1.3,
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
		};
	}, [styleSpec, onCursorMove, onHoverCountry, syncContextMenuCoords]);

	// Re-apply paint properties whenever the player's country changes so the
	// owned country lights up in signal amber. Waits for the style to load
	// the first time, then mutates the paint expressions in place.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const apply = () => {
			map.setPaintProperty("country-fill", "fill-color", fillExpression(myCountryCode));
			map.setPaintProperty("country-line", "line-color", lineColorExpression(myCountryCode));
		};
		if (map.isStyleLoaded()) {
			apply();
		} else {
			map.once("load", apply);
		}
	}, [myCountryCode]);

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

	// Expose flyToCity so PlayPage can pan the map when the user clicks a
	// city in the sidebar list. Looks up coords from the latest citiesRender.
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !onMapReady) return;
		onMapReady({
			flyToCity: (cityId: string) => {
				const c = citiesRender?.find((row) => row.id === cityId);
				if (!c) return;
				map.flyTo({ center: [c.lng, c.lat], zoom: Math.max(map.getZoom(), 4.5), duration: 600 });
			},
		});
	}, [citiesRender, onMapReady]);

	const zoomIn = useCallback(() => mapRef.current?.zoomIn(), []);
	const zoomOut = useCallback(() => mapRef.current?.zoomOut(), []);

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
					className="min-w-[14rem] font-mono text-xs"
					align="start"
					side="bottom"
					sideOffset={2}
					onCloseAutoFocus={(e) => e.preventDefault()}
				>
					{contextCoord && (
						<DropdownMenuLabel className="font-normal text-muted-foreground">
							{contextCoord.name ? `${contextCoord.name} · ${contextCoord.iso3}` : "Open ocean"}
						</DropdownMenuLabel>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="gap-2 font-mono text-xs"
						onSelect={copyLatLng}
						disabled={!contextCoord}
					>
						<Copy className="size-4 shrink-0" />
						Copy latitude and longitude
						{contextCoord && (
							<DropdownMenuShortcut>
								{fmt(contextCoord.lat, 2)}, {fmt(contextCoord.lng, 2)}
							</DropdownMenuShortcut>
						)}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="gap-2 font-mono text-xs"
						onSelect={copyCountry}
						disabled={!contextCoord?.iso3}
					>
						Copy country code
						{contextCoord?.iso3 && <DropdownMenuShortcut>{contextCoord.iso3}</DropdownMenuShortcut>}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ButtonGroup
				orientation="vertical"
				className="absolute right-3 bottom-3 z-10 backdrop-blur-sm"
				aria-label="Map zoom controls"
			>
				<Button
					variant="outline"
					size="icon"
					onClick={zoomIn}
					aria-label="Zoom in"
					className="border-border bg-card/95 hover:bg-accent"
				>
					<ZoomIn />
				</Button>
				<Button
					variant="outline"
					size="icon"
					onClick={zoomOut}
					aria-label="Zoom out"
					className="border-border bg-card/95 hover:bg-accent"
				>
					<ZoomOut />
				</Button>
			</ButtonGroup>

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
						className="w-64 border border-border bg-card/95 p-3 backdrop-blur-sm"
					>
						<div className="flex items-center gap-3">
							{popover.iso2 ? (
								<Image
									src={`https://flagcdn.com/w80/${popover.iso2}.png`}
									alt=""
									width={40}
									height={28}
									unoptimized
									className="h-7 w-10 flex-shrink-0 border border-border object-cover"
								/>
							) : (
								<div className="h-7 w-10 flex-shrink-0 border border-border bg-muted" />
							)}
							<div className="flex min-w-0 flex-col gap-0.5">
								<span className="truncate font-display font-medium text-foreground text-sm">
									{popover.name}
								</span>
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
									{popover.iso3}
								</span>
							</div>
						</div>
						<div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 font-mono text-[11px]">
							<div className="flex flex-col">
								<span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
									Cities
								</span>
								<span className="text-foreground">{popoverStats?.cityCount ?? "—"}</span>
							</div>
							<div className="flex flex-col">
								<span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
									Capital
								</span>
								<span className="truncate text-foreground">{popoverStats?.capital ?? "—"}</span>
							</div>
						</div>
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
						className="w-64 border border-border bg-card/95 p-3 backdrop-blur-sm"
					>
						<div className="flex items-baseline gap-2">
							<span className="truncate font-display font-medium text-foreground text-sm">
								{cityPopover.city.name}
							</span>
							{cityPopover.city.isCapital && (
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
									★ Capital
								</span>
							)}
						</div>
						<div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							{cityPopover.city.countryCode}
						</div>
						<div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 font-mono text-[11px]">
							<div className="flex flex-col">
								<span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
									Owner
								</span>
								<span className="flex items-baseline gap-1.5 truncate text-foreground">
									{cityPopover.city.ownerColor && (
										<span
											aria-hidden
											className="inline-block h-2 w-2"
											style={{ backgroundColor: cityPopover.city.ownerColor }}
										/>
									)}
									<span className="truncate">{cityPopover.city.ownerName ?? "Neutral"}</span>
								</span>
							</div>
							<div className="flex flex-col">
								<span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
									Population
								</span>
								<span className="text-foreground tabular-nums">
									{cityPopover.city.population.toLocaleString()}
								</span>
							</div>
						</div>
						<div className="mt-2 font-mono text-[9px] tracking-[0.04em] text-muted-foreground">
							Detail panel open in sidebar →
						</div>
					</PopoverContent>
				</Popover>
			)}
		</>
	);
}
