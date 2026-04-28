"use client";

import { type CursorCoord, GameMap, type HoveredCountry } from "@/components/game-map";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { gamesApi, queryKeys, worldApi } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { type WsStatus, closeGameSocket, getGameSocket } from "@/lib/game-socket";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const RES_DIVISOR = 100;

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

	const submitNoop = useMutation({
		mutationFn: () => gamesApi.submitOrder(gameId, { kind: "noop" }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) }),
	});

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

	const onCursorMove = useCallback((c: CursorCoord | null) => setCursor(c), []);
	const onHoverCountry = useCallback((c: HoveredCountry | null) => setHover(c), []);

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
		<div className="flex h-screen overflow-hidden bg-background text-foreground">
			{/* ─── Map area ─────────────────────────────────────────────────────── */}
			<div className="relative flex-1">
				<GameMap
					onCursorMove={onCursorMove}
					onHoverCountry={onHoverCountry}
					myCountryCode={myCountryCode}
					cities={world.data?.cities}
				/>

				{/* Top HUD — each panel anchored absolutely so cursor-readout
					 width changes don't shove the tick counter around. */}
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
				</div>

				{/* Bottom-left WS status pill */}
				<div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
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

			{/* ─── Right sidebar ────────────────────────────────────────────────── */}
			<aside className="flex w-80 flex-col border-l border-border bg-card">
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

				{/* Action buttons */}
				<section className="grid grid-cols-2 gap-px border-b border-border bg-border">
					<Button
						variant="ghost"
						className="h-12 rounded-none bg-card font-mono text-[11px] uppercase tracking-[0.18em] hover:bg-accent"
						disabled
					>
						Research
						<span className="ml-1 text-[9px] text-muted-foreground">P4</span>
					</Button>
					<Button
						variant="ghost"
						className="h-12 rounded-none bg-card font-mono text-[11px] uppercase tracking-[0.18em] hover:bg-accent"
						disabled
					>
						Coalition
						<span className="ml-1 text-[9px] text-muted-foreground">P6</span>
					</Button>
				</section>

				{/* Stats */}
				<section className="border-b border-border px-3 py-2">
					<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Nation
					</div>
					<div className="mt-1 flex items-baseline justify-between font-mono text-xs">
						<span className="text-muted-foreground">Cities owned</span>
						<span className="text-foreground">{myCities.length}</span>
					</div>
					<div className="flex items-baseline justify-between font-mono text-xs">
						<span className="text-muted-foreground">Players in game</span>
						<span className="text-foreground">{snapshot.data?.players.length ?? 0}</span>
					</div>
					<div className="flex items-baseline justify-between font-mono text-xs">
						<span className="text-muted-foreground">Pending orders</span>
						<span className="text-foreground">{snapshot.data?.myOrders.length ?? 0}</span>
					</div>
				</section>

				{/* Cities list — scrollable */}
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
							<li
								key={state.cityId}
								className="grid grid-cols-[1fr_auto] items-baseline gap-2 border-b border-border px-3 py-1.5"
							>
								<div className="flex items-baseline gap-2">
									<span className="text-sm text-foreground">{def.name}</span>
									{def.isCapital && (
										<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
											★
										</span>
									)}
								</div>
								<span className="font-mono text-xs text-muted-foreground">
									{state.population.toLocaleString()}
								</span>
							</li>
						))}
					</ul>
				</section>

				{/* Footer actions */}
				<section className="grid grid-cols-2 gap-px border-t border-border bg-border">
					<Button
						variant="ghost"
						className="h-10 rounded-none bg-card font-mono text-[11px] uppercase tracking-[0.18em] hover:bg-accent"
						onClick={() => submitNoop.mutate()}
						disabled={submitNoop.isPending}
					>
						{submitNoop.isPending ? "Sending…" : "Test order"}
					</Button>
					<Button
						variant="ghost"
						className="h-10 rounded-none bg-card font-mono text-[11px] uppercase tracking-[0.18em] text-destructive hover:bg-destructive/10"
						onClick={() => leave.mutate()}
						disabled={leave.isPending}
					>
						{leave.isPending ? "Leaving…" : "Leave game"}
					</Button>
				</section>
			</aside>
		</div>
	);
}
