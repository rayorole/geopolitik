"use client";

import { AppNav } from "@/components/app-nav";
import { NationFlag } from "@/components/nation-flag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { gamesApi, queryKeys, worldApi } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { factionToCss } from "@/lib/faction-colors";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

export default function JoinGamePage() {
	const params = useParams<{ gameId: string }>();
	const gameId = params.gameId;
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session, isPending: sessionPending } = useSession();
	const [selected, setSelected] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const searchId = useId();

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

	const claimedBy = useMemo(() => {
		const map = new Map<string, { displayName: string; color: string }>();
		for (const p of snapshot.data?.players ?? []) {
			map.set(p.countryCode, { displayName: p.displayName, color: p.color });
		}
		return map;
	}, [snapshot.data]);

	// Only playable countries (area >= 50k km^2) appear in the picker —
	// decoration countries (Belgium, Netherlands, etc.) render on the map
	// but cannot be claimed.
	const sortedCountries = useMemo(() => {
		if (!world.data) return [];
		return world.data.countries
			.filter((c) => c.isPlayable)
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [world.data]);

	const filteredCountries = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return sortedCountries;
		return sortedCountries.filter(
			(c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
		);
	}, [sortedCountries, query]);

	const selectedCountry = useMemo(
		() => sortedCountries.find((c) => c.code === selected) ?? null,
		[sortedCountries, selected],
	);

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
	if (alreadyJoined) {
		return (
			<>
				<AppNav />
				<main className="flex min-h-[60vh] items-center justify-center p-6">
					<Card className="w-full max-w-sm">
						<CardHeader>
							<CardTitle>You’re already in this game</CardTitle>
							<CardDescription>
								Game <code className="font-mono text-foreground">{snapshot.data?.game.code}</code>
							</CardDescription>
						</CardHeader>
						<CardContent className="flex gap-2">
							<Button asChild>
								<Link href={`/play/${gameId}`}>Open game</Link>
							</Button>
							<Button asChild variant="ghost">
								<Link href="/games">Back to games</Link>
							</Button>
						</CardContent>
					</Card>
				</main>
			</>
		);
	}

	const totalCountries = sortedCountries.length;
	const claimedCount = claimedBy.size;
	const availableCount = totalCountries - claimedCount;
	const isLoading = snapshot.isLoading || world.isLoading;

	return (
		<>
			<AppNav />
			<main className="mx-auto flex max-w-5xl flex-col gap-6 p-6 pb-32">
				<header className="flex flex-col gap-2">
					<p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
						Game · <span className="text-primary">{snapshot.data?.game.code ?? "…"}</span>
					</p>
					<h1 className="font-display text-3xl tracking-tight">Pick a country</h1>
					{!isLoading && (
						<p className="text-sm text-muted-foreground tabular-nums">
							<span className="text-foreground">{availableCount}</span> of {totalCountries}{" "}
							countries available · {claimedCount}{" "}
							{claimedCount === 1 ? "player has" : "players have"} already chosen
						</p>
					)}
				</header>

				<div className="relative">
					<label htmlFor={searchId} className="sr-only">
						Search countries
					</label>
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						id={searchId}
						type="search"
						autoComplete="off"
						spellCheck={false}
						placeholder="Search by country name or code…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="pl-9"
					/>
				</div>

				{isLoading ? (
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
						{Array.from({ length: 12 }, (_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholder grid
							<Skeleton key={i} className="h-[60px] w-full" />
						))}
					</div>
				) : filteredCountries.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 border border-dashed border-border py-16 text-center">
						<p className="text-sm text-muted-foreground">No countries match “{query}”.</p>
						<Button variant="ghost" size="sm" onClick={() => setQuery("")}>
							Clear search
						</Button>
					</div>
				) : (
					<ul
						aria-label="Available countries"
						className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
					>
						{filteredCountries.map((c) => {
							const owner = claimedBy.get(c.code);
							const taken = !!owner;
							const isSelected = selected === c.code;
							return (
								<li key={c.code}>
									<button
										type="button"
										disabled={taken}
										aria-pressed={isSelected}
										aria-label={
											taken && owner
												? `${c.name} (${c.code}), claimed by ${owner.displayName}`
												: `${c.name} (${c.code})`
										}
										onClick={() => setSelected(c.code)}
										className={cn(
											"flex h-full w-full items-center gap-3 border bg-card px-3 py-3 text-left transition-colors",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
											taken
												? "cursor-not-allowed border-border/60 bg-muted/30 opacity-60"
												: isSelected
													? "border-primary bg-primary/10"
													: "border-border hover:border-ring hover:bg-accent",
										)}
									>
										<NationFlag
											code={c.code}
											title={c.name}
											className="h-7 w-10 flex-shrink-0 shadow-sm"
										/>
										<div className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="truncate font-display text-sm tracking-tight">{c.name}</span>
											<div className="flex min-w-0 items-center gap-2">
												<code className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
													{c.code}
												</code>
												{taken && owner && (
													<span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
														<span
															aria-hidden="true"
															className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
															style={{
																backgroundColor: factionToCss(owner.color) ?? "transparent",
															}}
														/>
														<span className="truncate">{owner.displayName}</span>
													</span>
												)}
											</div>
										</div>
										{isSelected && (
											<Check className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
										)}
									</button>
								</li>
							);
						})}
					</ul>
				)}

				{join.isError && (
					<p role="alert" className="font-mono text-xs text-destructive">
						{(join.error as Error).message}
					</p>
				)}
			</main>

			<footer className="sticky bottom-0 z-10 border-t border-border bg-background/80 backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-3">
					<Button asChild variant="ghost">
						<Link href="/games">← Back</Link>
					</Button>
					<div className="flex items-center gap-3">
						{selectedCountry && (
							<span className="hidden items-center gap-2 sm:flex">
								<NationFlag
									code={selectedCountry.code}
									title={selectedCountry.name}
									className="h-5 w-7"
								/>
								<span className="font-display text-sm tracking-tight">{selectedCountry.name}</span>
							</span>
						)}
						<Button
							disabled={!selected || join.isPending}
							onClick={() => selected && join.mutate(selected)}
						>
							{join.isPending
								? "Joining…"
								: selectedCountry
									? `Claim ${selectedCountry.name}`
									: "Select a country"}
						</Button>
					</div>
				</div>
			</footer>
		</>
	);
}
