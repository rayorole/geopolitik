"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { gamesApi, queryKeys, worldApi } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function JoinGamePage() {
	const params = useParams<{ gameId: string }>();
	const gameId = params.gameId;
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session, isPending: sessionPending } = useSession();
	const [selected, setSelected] = useState<string | null>(null);

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

	const join = useMutation({
		mutationFn: (countryCode: string) => gamesApi.join(gameId, { countryCode }),
		onSuccess: async () => {
			await queryClient.refetchQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
			router.push(`/play/${gameId}`);
		},
	});

	const claimedCountryCodes = useMemo(
		() => new Set(snapshot.data?.players.map((p) => p.countryCode) ?? []),
		[snapshot.data],
	);

	const sortedCountries = useMemo(() => {
		if (!world.data) return [];
		return [...world.data.countries].sort((a, b) => a.name.localeCompare(b.name));
	}, [world.data]);

	if (sessionPending) return null;
	if (!session) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle>Sign in required</CardTitle>
						<CardDescription>Sign in to join this game.</CardDescription>
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

	const alreadyJoined = !!snapshot.data?.mePlayerId;

	// biome-ignore lint/correctness/useExhaustiveDependencies: gameId/router are stable navigation targets
	useEffect(() => {
		if (alreadyJoined) router.replace(`/play/${gameId}`);
	}, [alreadyJoined]);

	if (alreadyJoined) return null;

	return (
		<main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
			<header>
				<p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
					Game · <span className="text-primary">{snapshot.data?.game.code ?? "…"}</span>
				</p>
				<h1 className="font-display text-3xl tracking-tight">Pick a country</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					{snapshot.data?.players.length ?? 0} other{" "}
					{snapshot.data?.players.length === 1 ? "player has" : "players have"} already chosen.
				</p>
			</header>

			{(snapshot.isLoading || world.isLoading) && (
				<p className="text-sm text-muted-foreground">Loading world data…</p>
			)}

			{world.data && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
					{sortedCountries.map((c) => {
						const taken = claimedCountryCodes.has(c.code);
						const isSelected = selected === c.code;
						return (
							<button
								type="button"
								key={c.code}
								disabled={taken}
								onClick={() => setSelected(c.code)}
								className={`flex flex-col items-start gap-1 border px-3 py-2 text-left transition-colors ${
									taken
										? "cursor-not-allowed border-border bg-muted/40 opacity-50"
										: isSelected
											? "border-primary bg-primary/10"
											: "border-border bg-card hover:border-ring hover:bg-accent"
								}`}
							>
								<code className="font-mono text-xs tracking-[0.12em] text-muted-foreground">
									{c.code}
								</code>
								<span className="text-sm">{c.name}</span>
								{taken && (
									<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
										Taken
									</span>
								)}
							</button>
						);
					})}
				</div>
			)}

			<footer className="flex items-center justify-between border-t border-border pt-4">
				<Button asChild variant="ghost">
					<Link href="/games">← Back</Link>
				</Button>
				<Button
					disabled={!selected || join.isPending}
					onClick={() => selected && join.mutate(selected)}
				>
					{join.isPending ? "Joining…" : selected ? `Claim ${selected}` : "Select a country"}
				</Button>
			</footer>
			{join.isError && (
				<p className="font-mono text-xs text-destructive">{(join.error as Error).message}</p>
			)}
		</main>
	);
}
