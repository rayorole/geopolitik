"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Minus, Plus } from "lucide-react";
import maplibregl, { type Map as MapInstance } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
 * <GameMap> — Phase 1 (slim).
 * Pan + zoom across the world. Country polygons render from a static
 * Natural-Earth 110m GeoJSON served from /world-countries.geojson. Hover
 * highlights a country; right-click opens a shadcn context menu with the
 * clicked lat/lng. Cursor coordinates stream out via onCursorMove.
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
	],
};

export type CursorCoord = { lat: number; lng: number };
export type HoveredCountry = { iso3: string; iso2: string | null; name: string };

export type GameMapProps = {
	onCursorMove?: (coord: CursorCoord | null) => void;
	onHoverCountry?: (country: HoveredCountry | null) => void;
	myCountryCode?: string | null;
};

function fmt(n: number, dp = 3): string {
	return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function GameMap({ onCursorMove, onHoverCountry, myCountryCode }: GameMapProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<MapInstance | null>(null);
	const hoverIdRef = useRef<number | null>(null);
	const clickAudioRef = useRef<HTMLAudioElement | null>(null);
	const [contextCoord, setContextCoord] = useState<{
		lat: number;
		lng: number;
		iso3: string | null;
		name: string | null;
	} | null>(null);

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
		map.addControl(
			new maplibregl.AttributionControl({
				customAttribution:
					'Country boundaries © <a href="https://www.naturalearthdata.com" target="_blank" rel="noreferrer">Natural Earth</a>',
				compact: true,
			}),
			"bottom-left",
		);
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
			onHoverCountry?.(null);
		});

		map.on("click", "country-fill", () => {
			const audio = clickAudioRef.current;
			if (!audio) return;
			audio.currentTime = 0;
			void audio.play().catch(() => {
				// Browsers block autoplay until the user has interacted with
				// the page. A click on the map IS that interaction, but if a
				// race condition still kills it, fail quietly.
			});
		});

		map.on("mousemove", (e) => onCursorMove?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
		map.on("mouseout", () => onCursorMove?.(null));

		return () => {
			ro.disconnect();
			map.remove();
			mapRef.current = null;
		};
	}, [styleSpec, onCursorMove, onHoverCountry]);

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

	const onContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		const map = mapRef.current;
		const container = containerRef.current;
		if (!map || !container) return;
		const rect = container.getBoundingClientRect();
		const point: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
		const lngLat = map.unproject(point);
		const features = map.queryRenderedFeatures(point, { layers: ["country-fill"] });
		const props = features[0]?.properties ?? null;
		setContextCoord({
			lat: lngLat.lat,
			lng: lngLat.lng,
			iso3: (props?.ISO_A3 as string) ?? (props?.ADM0_A3 as string) ?? null,
			name: (props?.NAME as string) ?? (props?.ADMIN as string) ?? null,
		});
	}, []);

	const copyCoords = useCallback(() => {
		if (!contextCoord) return;
		void navigator.clipboard?.writeText(`${fmt(contextCoord.lat, 5)}, ${fmt(contextCoord.lng, 5)}`);
	}, [contextCoord]);

	const copyCountry = useCallback(() => {
		if (!contextCoord?.iso3) return;
		void navigator.clipboard?.writeText(contextCoord.iso3);
	}, [contextCoord]);

	const zoomIn = useCallback(() => mapRef.current?.zoomIn(), []);
	const zoomOut = useCallback(() => mapRef.current?.zoomOut(), []);

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						onContextMenu={onContextMenu}
						className="absolute inset-0"
						style={{ position: "absolute", inset: 0 }}
					>
						<div
							ref={containerRef}
							style={{ width: "100%", height: "100%" }}
							className="h-full w-full"
						/>
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent className="font-mono text-xs">
					{contextCoord && (
						<ContextMenuLabel className="text-muted-foreground">
							{contextCoord.name ? `${contextCoord.name} · ${contextCoord.iso3}` : "Open ocean"}
						</ContextMenuLabel>
					)}
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={copyCoords} disabled={!contextCoord}>
						Copy coordinates
						{contextCoord && (
							<span className="ml-auto pl-3 text-muted-foreground">
								{fmt(contextCoord.lat, 2)}, {fmt(contextCoord.lng, 2)}
							</span>
						)}
					</ContextMenuItem>
					<ContextMenuItem onSelect={copyCountry} disabled={!contextCoord?.iso3}>
						Copy country code
						{contextCoord?.iso3 && (
							<span className="ml-auto pl-3 text-muted-foreground">{contextCoord.iso3}</span>
						)}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<ButtonGroup
				orientation="vertical"
				className="absolute right-3 bottom-12 z-10 backdrop-blur-sm"
				aria-label="Map zoom controls"
			>
				<Button
					variant="outline"
					size="icon"
					onClick={zoomIn}
					aria-label="Zoom in"
					className="border-border bg-card/95 hover:bg-accent"
				>
					<Plus />
				</Button>
				<Button
					variant="outline"
					size="icon"
					onClick={zoomOut}
					aria-label="Zoom out"
					className="border-border bg-card/95 hover:bg-accent"
				>
					<Minus />
				</Button>
			</ButtonGroup>
		</>
	);
}
