"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { gamesApi, queryKeys, worldApi } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { type WsStatus, closeGameSocket, getGameSocket } from "@/lib/game-socket";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";

const RES_DIVISOR = 100; // resources stored as integer × 100

function fmt(n: number): string {
	const v = n / RES_DIVISOR;
	return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default function PlayPage() {
	const params = useParams<{ gameId: string }>();
	const gameId = params.gameId;
	const queryClient = useQueryClient();
	const { data: session, isPending: sessionPending } = useSession();

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
		<main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-6">
			<header className="flex items-baseline justify-between">
				<div>
					<p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
						Game · <span className="text-primary">{snapshot.data?.game.code ?? "…"}</span>
					</p>
					<h1 className="font-display text-3xl tracking-tight">
						Tick #{snapshot.data?.game.tick.toLocaleString() ?? "—"}
					</h1>
				</div>
				<div className="flex items-center gap-3">
					<span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
						WS:{" "}
						<span
							className={
								wsStatus === "open"
									? "text-primary"
									: wsStatus === "closed"
										? "text-destructive"
										: ""
							}
						>
							{wsStatus}
						</span>
					</span>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => submitNoop.mutate()}
						disabled={submitNoop.isPending}
					>
						{submitNoop.isPending ? "…" : "Test order"}
					</Button>
				</div>
			</header>

			<section className="grid grid-cols-2 border border-border bg-card sm:grid-cols-5">
				{(
					[
						["MONEY", myNation?.money ?? 0],
						["OIL", myNation?.oil ?? 0],
						["STEEL", myNation?.steel ?? 0],
						["ELECTRONICS", myNation?.electronics ?? 0],
						["POPULATION", myNation?.population ?? 0],
					] as const
				).map(([label, val]) => (
					<div
						key={label}
						className="flex flex-col gap-1 border-r border-border px-4 py-3 last:border-r-0"
					>
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							{label}
						</span>
						<span className="font-mono text-xl text-foreground">
							{label === "POPULATION" ? Number(val).toLocaleString() : fmt(Number(val))}
						</span>
					</div>
				))}
			</section>

			<section className="flex flex-col gap-1">
				<h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
					Cities · {myCities.length}
				</h2>
				<ul className="border border-border bg-card">
					{myCities.length === 0 && (
						<li className="px-4 py-3 text-sm text-muted-foreground">No owned cities yet.</li>
					)}
					{myCities.map(({ state, def }) => (
						<li
							key={state.cityId}
							className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-4 py-2 last:border-b-0"
						>
							<div className="flex items-baseline gap-2">
								<span className="text-foreground">{def.name}</span>
								{def.isCapital && (
									<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
										capital
									</span>
								)}
							</div>
							<span className="font-mono text-xs text-muted-foreground">
								{def.lat.toFixed(2)}°, {def.lng.toFixed(2)}°
							</span>
							<span className="font-mono text-sm text-foreground">
								pop {state.population.toLocaleString()}
							</span>
						</li>
					))}
				</ul>
			</section>

			<footer>
				<Button asChild variant="ghost">
					<Link href="/games">← Back to lobby</Link>
				</Button>
			</footer>
		</main>
	);
}
