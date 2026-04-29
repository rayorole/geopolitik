"use client";

import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { gamesApi, queryKeys } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function GamesPage() {
	const router = useRouter();
	const { data: session, isPending: sessionPending } = useSession();
	const [code, setCode] = useState("");
	const [searchError, setSearchError] = useState<string | null>(null);

	const browse = useQuery({
		queryKey: queryKeys.gamesBrowse,
		queryFn: gamesApi.browse,
		refetchInterval: 5_000,
	});

	const create = useMutation({
		mutationFn: gamesApi.create,
		onSuccess: ({ id }) => router.push(`/games/${id}/join`),
	});

	const findByCode = useMutation({
		mutationFn: (c: string) => gamesApi.byCode(c),
		onSuccess: (g) => router.push(`/games/${g.id}/join`),
		onError: (err) =>
			setSearchError(err.message.includes("404") ? "No game with that code." : err.message),
	});

	if (sessionPending) return null;
	if (!session) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle>Sign in required</CardTitle>
						<CardDescription>Sign in to browse and join games.</CardDescription>
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

	return (
		<>
			<AppNav />
			<main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
				<header className="flex items-baseline justify-between">
					<div>
						<h1 className="font-display text-3xl tracking-tight">Games</h1>
						<p className="text-sm text-muted-foreground">
							Browse joinable games or jump in by code.
						</p>
					</div>
					<Button onClick={() => create.mutate()} disabled={create.isPending}>
						{create.isPending ? "Creating…" : "New game"}
					</Button>
				</header>

				<Card>
					<CardHeader>
						<CardTitle className="font-mono text-sm uppercase tracking-wider">
							Find by code
						</CardTitle>
						<CardDescription>
							Enter the 8-character join code shared by another player.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							className="flex gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								setSearchError(null);
								findByCode.mutate(code);
							}}
						>
							<Input
								placeholder="ABCDEFGH"
								value={code}
								onChange={(e) => setCode(e.target.value.toUpperCase())}
								maxLength={8}
								className="font-mono uppercase tracking-[0.18em]"
							/>
							<Button type="submit" disabled={code.length !== 8 || findByCode.isPending}>
								Find
							</Button>
						</form>
						{searchError && (
							<p className="mt-2 font-mono text-xs text-destructive">{searchError}</p>
						)}
					</CardContent>
				</Card>

				<section className="flex flex-col gap-3">
					<h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
						Open lobbies · {browse.data?.length ?? 0}
					</h2>
					{browse.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
					{browse.data && browse.data.length === 0 && (
						<p className="text-sm text-muted-foreground">No active games. Create one above.</p>
					)}
					<ul className="flex flex-col gap-2">
						{browse.data?.map((g) => (
							<li key={g.id}>
								<Link
									href={`/games/${g.id}/join`}
									className="flex items-center justify-between border border-border bg-card px-4 py-3 transition-colors hover:border-ring hover:bg-accent"
								>
									<div className="flex flex-col gap-1">
										<code className="font-mono text-sm tracking-[0.18em]">{g.code}</code>
										<span className="text-xs text-muted-foreground">
											Tick #{g.tick.toLocaleString()} · {g.playerCount} player
											{g.playerCount === 1 ? "" : "s"} · {g.unclaimedCountryCount} unclaimed
										</span>
									</div>
									<span className="font-mono text-xs uppercase tracking-wider text-primary">
										Join →
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			</main>
		</>
	);
}
