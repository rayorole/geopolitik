"use client";

import { CityDetail, CityRowMini } from "@/components/city-detail";
import { DiplomacyDrawer } from "@/components/diplomacy-drawer";
import {
	type CityRender,
	type CursorCoord,
	GameMap,
	type HoveredCity,
	type HoveredCountry,
} from "@/components/game-map";
import { UnitIcon } from "@/components/icons";
import { PolicyPanel } from "@/components/policy-panel";
import { ResearchDrawer } from "@/components/research-drawer";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { gamesApi, queryKeys, worldApi } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { factionToHex } from "@/lib/faction-colors";
import { type WsStatus, closeGameSocket, getGameSocket } from "@/lib/game-socket";
import { type SelectedCity, writeSelectedCity } from "@/lib/selected-city";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ZoomIn, ZoomOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const RES_DIVISOR = 100;

// Right-panel morph between the nation overview and a wider city detail.
// The HUD layer's `right` and the panel's `width` animate inline with the
// layout so the map's flex-1 area shrinks/grows in step — the cursor + tick
// HUD anchored to the map edges stays clear of the panel, and MapLibre's
// ResizeObserver keeps the canvas in sync.
const PANEL_WIDTH = { overview: 320, detail: 480 } as const;
const PANEL_TRANSITION_CSS = "0.32s cubic-bezier(0.32, 0.72, 0, 1)";

function fmtRes(n: number): string {
	return (n / RES_DIVISOR).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtCoord(n: number, dp = 3): string {
	return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export default function PlayPage() {
	const params = useParams<{ gameId: string }>();
	const gameId = params.gameId;
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session, isPending: sessionPending } = useSession();

	const [cursor, setCursor] = useState<CursorCoord | null>(null);
	const [hover, setHover] = useState<HoveredCountry | null>(null);
	const [hoverCity, setHoverCity] = useState<HoveredCity | null>(null);
	const flyToCityRef = useRef<((cityId: string) => void) | null>(null);
	const zoomInRef = useRef<(() => void) | null>(null);
	const zoomOutRef = useRef<(() => void) | null>(null);

	const snapshot = useQuery({
		queryKey: queryKeys.gameSnapshot(gameId),
		queryFn: () => gamesApi.snapshot(gameId),
		enabled: !!session,
	});

	const world = useQuery({
		queryKey: queryKeys.worldCities,
		queryFn: worldApi.cities,
		staleTime: 60 * 60 * 1000,
		enabled: !!session,
	});

	// Phase 6c: alliance state drives map coloring (allies render blue).
	// Polled at 15s staleTime — light load, responsive to membership changes.
	const diplomacy = useQuery({
		queryKey: queryKeys.gameDiplomacy(gameId),
		queryFn: () => gamesApi.diplomacy(gameId),
		enabled: !!session && !!snapshot.data?.mePlayerId,
		staleTime: 15_000,
	});

	// Set of player IDs in the same alliance as me (excluding me).
	const allyPlayerIds = useMemo<Set<string>>(() => {
		const set = new Set<string>();
		const me = snapshot.data?.mePlayerId;
		if (!me || !diplomacy.data?.myAlliance) return set;
		for (const m of diplomacy.data.allMembers) {
			if (m.playerId !== me) set.add(m.playerId);
		}
		return set;
	}, [snapshot.data?.mePlayerId, diplomacy.data]);

	// ISO3 codes of countries held by alliance peers — drives the map's
	// country-fill + country-line paint expressions.
	const alliedCountryCodes = useMemo<string[]>(() => {
		if (!snapshot.data || allyPlayerIds.size === 0) return [];
		return snapshot.data.players.filter((p) => allyPlayerIds.has(p.id)).map((p) => p.countryCode);
	}, [snapshot.data, allyPlayerIds]);

	const { data: wsStatus = "connecting" } = useQuery<WsStatus>({
		queryKey: queryKeys.wsStatus(gameId),
		queryFn: () => "connecting",
		enabled: !!session,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
	});

	useEffect(() => {
		if (!session) return;
		getGameSocket(gameId, queryClient);
		return () => closeGameSocket(gameId);
	}, [session, gameId, queryClient]);

	const leave = useMutation({
		mutationFn: () => gamesApi.leave(gameId),
		onSuccess: () => router.push("/games"),
	});

	const myCities = useMemo(() => {
		if (!snapshot.data || !world.data) return [];
		const cityById = new Map(world.data.cities.map((c) => [c.id, c]));
		return snapshot.data.cityState
			.filter((cs) => cs.ownerPlayerId === snapshot.data?.mePlayerId)
			.map((cs) => ({ state: cs, def: cityById.get(cs.cityId) }))
			.filter(
				(row): row is { state: typeof row.state; def: NonNullable<typeof row.def> } => !!row.def,
			)
			.sort((a, b) => b.state.population - a.state.population);
	}, [snapshot.data, world.data]);

	const myNation = useMemo(
		() => snapshot.data?.nationState.find((n) => n.playerId === snapshot.data?.mePlayerId) ?? null,
		[snapshot.data],
	);

	const myCountryCode = useMemo(
		() =>
			snapshot.data?.players.find((p) => p.id === snapshot.data?.mePlayerId)?.countryCode ?? null,
		[snapshot.data],
	);

	// Every world city renders — cities without a city_state row (no player has
	// joined that country) fall back to basePopulation and show as neutral. The
	// map layer hides neutrals at world zoom so the overview stays readable.
	// Alliance peers' cities use the ally-blue swatch instead of their faction
	// color so the team reads at a glance on the map.
	const citiesRender = useMemo<CityRender[]>(() => {
		if (!snapshot.data || !world.data) return [];
		const playerById = new Map(snapshot.data.players.map((p) => [p.id, p]));
		const popByCity = new Map(snapshot.data.cityState.map((cs) => [cs.cityId, cs]));
		return world.data.cities.map((c) => {
			const cs = popByCity.get(c.id);
			const owner = cs?.ownerPlayerId ? playerById.get(cs.ownerPlayerId) : undefined;
			const isMine = !!owner && owner.id === snapshot.data?.mePlayerId;
			const isAlly = !!owner && allyPlayerIds.has(owner.id);
			const ownerColor = owner ? (isAlly ? "#4a90d9" : factionToHex(owner.color)) : null;
			return {
				id: c.id,
				lng: c.lng,
				lat: c.lat,
				name: c.name,
				population: cs?.population ?? c.basePopulation,
				ownerColor,
				ownerName: owner?.displayName ?? null,
				isMine,
				isAlly,
				isCapital: c.isCapital,
				countryCode: c.countryCode,
			} satisfies CityRender;
		});
	}, [snapshot.data, world.data, allyPlayerIds]);

	const { data: selectedCityId = null } = useQuery<SelectedCity>({
		queryKey: queryKeys.selectedCity(gameId),
		queryFn: () => null,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
	});

	const selectCity = useCallback(
		(cityId: string | null) => {
			writeSelectedCity(queryClient, gameId, cityId);
		},
		[queryClient, gameId],
	);

	const onCityClickFromMap = useCallback(
		(cityId: string) => {
			selectCity(cityId);
		},
		[selectCity],
	);

	const onCityClickFromList = useCallback(
		(cityId: string) => {
			selectCity(cityId);
			flyToCityRef.current?.(cityId);
		},
		[selectCity],
	);

	const onMapReady = useCallback(
		(api: { flyToCity: (cityId: string) => void; zoomIn: () => void; zoomOut: () => void }) => {
			flyToCityRef.current = api.flyToCity;
			zoomInRef.current = api.zoomIn;
			zoomOutRef.current = api.zoomOut;
		},
		[],
	);

	const onCursorMove = useCallback((c: CursorCoord | null) => setCursor(c), []);
	const onHoverCountry = useCallback((c: HoveredCountry | null) => setHover(c), []);
	const onHoverCity = useCallback((c: HoveredCity | null) => setHoverCity(c), []);

	if (sessionPending) return null;
	if (!session) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle>Sign in required</CardTitle>
						<CardDescription>You need an account to view a live game.</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild>
							<Link href="/sign-in">Sign in</Link>
						</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	if (snapshot.data && !snapshot.data.mePlayerId) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle>Not in this game</CardTitle>
						<CardDescription>You haven't claimed a country yet.</CardDescription>
					</CardHeader>
					<CardContent className="flex gap-2">
						<Button asChild>
							<Link href={`/games/${gameId}/join`}>Pick country</Link>
						</Button>
						<Button asChild variant="ghost">
							<Link href="/games">Back to list</Link>
						</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	return (
		<div className="relative h-screen overflow-hidden bg-background text-foreground">
			{/* ─── Map area — pinned to viewport so MapLibre's canvas never resizes
				 during the panel morph (resizing the canvas mid-animation showed
				 black frames across the whole screen). The right panel overlays
				 the map and the HUD layer shifts via right-offset animation, so
				 nothing is ever covered or shoved out of place. ─────────────── */}
			<div className="absolute inset-0">
				<GameMap
					onCursorMove={onCursorMove}
					onHoverCountry={onHoverCountry}
					onHoverCity={onHoverCity}
					onCityClick={onCityClickFromMap}
					myCountryCode={myCountryCode}
					alliedCountryCodes={alliedCountryCodes}
					cities={world.data?.cities}
					citiesRender={citiesRender}
					selectedCityId={selectedCityId}
					onMapReady={onMapReady}
				/>
			</div>

			{/* HUD layer — covers the visible map area, ending where the right
				 panel begins. Animating `right` keeps the cursor card and centered
				 widgets aligned with the live map width. */}
			<div
				className="pointer-events-none absolute inset-y-0 left-0"
				style={{
					right: selectedCityId ? PANEL_WIDTH.detail : PANEL_WIDTH.overview,
					transition: `right ${PANEL_TRANSITION_CSS}`,
				}}
			>
				<div className="pointer-events-auto absolute top-3 left-3 flex items-center gap-2 border border-border bg-card/95 px-3 py-2 backdrop-blur-sm">
					<Button asChild variant="ghost" size="sm" className="h-7 px-2">
						<Link href="/games">← Menu</Link>
					</Button>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Game
					</span>
					<code className="font-mono text-sm tracking-[0.14em] text-foreground">
						{snapshot.data?.game.code ?? "…"}
					</code>
					<span className="h-4 w-px bg-border" />
					<ResearchDrawer gameId={gameId} mePlayerId={snapshot.data?.mePlayerId ?? null} />
					<DiplomacyDrawer gameId={gameId} mePlayerId={snapshot.data?.mePlayerId ?? null} />
				</div>

				<div className="pointer-events-auto absolute top-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 border border-border bg-card/95 px-4 py-2 backdrop-blur-sm">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Tick
					</span>
					<span className="font-mono text-lg leading-none text-primary tabular-nums">
						#{snapshot.data?.game.tick.toLocaleString() ?? "—"}
					</span>
				</div>

				<div className="pointer-events-auto absolute top-3 right-3 flex w-56 flex-col items-end gap-1 border border-border bg-card/95 px-3 py-2 font-mono text-xs backdrop-blur-sm">
					<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Cursor
					</span>
					<div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 tabular-nums">
						<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							LAT
						</span>
						<span className="text-right text-foreground">
							{cursor ? `${fmtCoord(cursor.lat)}°` : "—"}
						</span>
						<span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							LON
						</span>
						<span className="text-right text-foreground">
							{cursor ? `${fmtCoord(cursor.lng)}°` : "—"}
						</span>
					</div>
					<div className="mt-1 flex h-4 w-full items-center justify-end gap-2 overflow-hidden">
						{hover?.iso2 ? (
							<Image
								src={`https://flagcdn.com/w40/${hover.iso2}.png`}
								alt=""
								width={20}
								height={14}
								unoptimized
								className="h-3.5 w-5 flex-shrink-0 border border-border object-cover"
							/>
						) : null}
						<span
							className={`truncate text-[11px] tracking-[0.06em] ${hover?.iso3 ? "text-primary" : "text-muted-foreground/40"}`}
						>
							{hover?.iso3 ? `${hover.name} · ${hover.iso3}` : "—"}
						</span>
					</div>
					{hoverCity && (
						<div className="mt-0.5 flex h-4 w-full items-center justify-end overflow-hidden">
							<span className="truncate text-[10px] tracking-[0.04em] text-foreground">
								◉ {hoverCity.name}
							</span>
						</div>
					)}
				</div>

				{/* Bottom-right zoom controls — sit inside the HUD layer so the
					 animated `right` offset keeps them clear of the panel. */}
				<ButtonGroup
					orientation="vertical"
					className="pointer-events-auto absolute right-3 bottom-3 backdrop-blur-sm"
					aria-label="Map zoom controls"
				>
					<Button
						variant="outline"
						size="icon"
						onClick={() => zoomInRef.current?.()}
						aria-label="Zoom in"
						className="border-border bg-card/95 hover:bg-accent"
					>
						<ZoomIn />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() => zoomOutRef.current?.()}
						aria-label="Zoom out"
						className="border-border bg-card/95 hover:bg-accent"
					>
						<ZoomOut />
					</Button>
				</ButtonGroup>

				{/* Bottom-center WS status pill */}
				<div className="absolute bottom-3 left-1/2 -translate-x-1/2">
					<div className="pointer-events-auto flex items-center gap-2 border border-border bg-card/95 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] backdrop-blur-sm">
						<span
							className={
								wsStatus === "open"
									? "text-primary"
									: wsStatus === "closed"
										? "text-destructive"
										: "text-muted-foreground"
							}
						>
							● WS {wsStatus}
						</span>
					</div>
				</div>
			</div>

			{/* ─── Right panel — morphs between nation overview and city detail ── */}
			<aside
				className="absolute top-0 right-0 flex h-full flex-col overflow-hidden border-l border-border bg-card"
				style={{
					width: selectedCityId ? PANEL_WIDTH.detail : PANEL_WIDTH.overview,
					transition: `width ${PANEL_TRANSITION_CSS}`,
				}}
			>
				{selectedCityId && snapshot.data && world.data ? (
					<div className="flex min-h-0 flex-1 flex-col">
						<CityDetail
							gameId={gameId}
							cityId={selectedCityId}
							snapshot={snapshot.data}
							world={world.data}
							onBack={() => selectCity(null)}
						/>
					</div>
				) : (
					<div className="flex min-h-0 flex-1 flex-col">
						{/* Resource bar */}
						<section className="grid grid-cols-2 border-b border-border">
							{(
								[
									["MONEY", myNation?.money ?? 0, false],
									["OIL", myNation?.oil ?? 0, false],
									["STEEL", myNation?.steel ?? 0, false],
									["ELECTRONICS", myNation?.electronics ?? 0, false],
									["POPULATION", myNation?.population ?? 0, true],
								] as const
							).map(([label, val, isPop]) => (
								<div
									key={label}
									className="flex flex-col gap-1 border-b border-r border-border px-3 py-2 last:border-r-0 even:border-r-0"
								>
									<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
										{label}
									</span>
									<span className="font-mono text-base leading-none text-foreground">
										{isPop ? Number(val).toLocaleString() : fmtRes(Number(val))}
									</span>
								</div>
							))}
						</section>

						{/* National policy sliders */}
						<PolicyPanel
							gameId={gameId}
							snapshot={snapshot.data}
							disabled={!snapshot.data?.mePlayerId}
						/>

						{/* Stats */}
						<section className="border-b border-border px-3 py-2">
							<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
								Nation
							</div>
							{(
								[
									["city", "Cities owned", myCities.length],
									["alliance", "Players in game", snapshot.data?.players.length ?? 0],
									["supply", "Pending orders", snapshot.data?.myOrders.length ?? 0],
								] as const
							).map(([glyph, label, value]) => (
								<div
									key={label}
									className="mt-1 flex items-center justify-between gap-2 font-mono text-xs"
								>
									<span className="inline-flex items-center gap-2 text-muted-foreground">
										<UnitIcon
											glyph={glyph}
											size={14}
											className="flex-shrink-0 text-muted-foreground/80"
											aria-hidden
										/>
										{label}
									</span>
									<span className="text-foreground tabular-nums">{value}</span>
								</div>
							))}
						</section>

						{/* Cities list */}
						<section className="flex min-h-0 flex-1 flex-col">
							<div className="flex items-baseline justify-between border-b border-border px-3 py-2">
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
									Cities · {myCities.length}
								</span>
							</div>
							<ul className="flex-1 overflow-y-auto">
								{myCities.length === 0 && (
									<li className="px-3 py-3 font-mono text-xs text-muted-foreground">
										No owned cities.
									</li>
								)}
								{myCities.map(({ state, def }) => (
									<li key={state.cityId}>
										<CityRowMini
											name={def.name}
											population={state.population}
											isCapital={def.isCapital}
											isSelected={selectedCityId === state.cityId}
											onClick={() => onCityClickFromList(state.cityId)}
										/>
									</li>
								))}
							</ul>
						</section>

						{/* Footer actions */}
						<section className="border-t border-border bg-border">
							<Button
								variant="ghost"
								className="h-10 w-full rounded-none bg-card font-mono text-[11px] uppercase tracking-[0.18em] text-destructive hover:bg-destructive/10"
								onClick={() => leave.mutate()}
								disabled={leave.isPending}
							>
								{leave.isPending ? "Leaving…" : "Leave game"}
							</Button>
						</section>
					</div>
				)}
			</aside>
		</div>
	);
}
