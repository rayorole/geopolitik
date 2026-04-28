"use client";

import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
	signal500a18: "rgba(214, 139, 62, 0.22)", // same hue at ~22% alpha for hover fill
} as const;

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
			paint: {
				"fill-color": [
					"case",
					["boolean", ["feature-state", "hover"], false],
					COLOR.signal500a18,
					COLOR.ink3,
				],
				"fill-outline-color": COLOR.ink5,
			},
		},
		{
			id: "country-line",
			type: "line",
			source: "countries",
			paint: {
				"line-color": [
					"case",
					["boolean", ["feature-state", "hover"], false],
					COLOR.signal500,
					COLOR.ink5,
				],
				"line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.5, 0.5],
			},
		},
	],
};

export type CursorCoord = { lat: number; lng: number };
export type HoveredCountry = { iso3: string; name: string };

export type GameMapProps = {
	onCursorMove?: (coord: CursorCoord | null) => void;
	onHoverCountry?: (country: HoveredCountry | null) => void;
};

function fmt(n: number, dp = 3): string {
	return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function GameMap({ onCursorMove, onHoverCountry }: GameMapProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<MapInstance | null>(null);
	const hoverIdRef = useRef<number | null>(null);
	const [contextCoord, setContextCoord] = useState<{
		lat: number;
		lng: number;
		iso3: string | null;
		name: string | null;
	} | null>(null);

	const styleSpec = useMemo(() => STYLE, []);

	useEffect(() => {
		if (!containerRef.current) return;

		const map = new maplibregl.Map({
			container: containerRef.current,
			style: styleSpec,
			center: [10, 30],
			zoom: 1.5,
			minZoom: 1,
			maxZoom: 8,
			renderWorldCopies: true,
			attributionControl: false,
		});
		map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
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
			onHoverCountry?.({
				iso3: (props.ISO_A3 as string) ?? (props.ADM0_A3 as string) ?? "",
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

		map.on("mousemove", (e) => onCursorMove?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
		map.on("mouseout", () => onCursorMove?.(null));

		return () => {
			map.remove();
			mapRef.current = null;
		};
	}, [styleSpec, onCursorMove, onHoverCountry]);

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

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div ref={containerRef} onContextMenu={onContextMenu} className="absolute inset-0" />
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
	);
}
