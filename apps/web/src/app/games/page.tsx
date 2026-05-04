"use client";

import { AppNav } from "@/components/app-nav";
import { OpenLobbies } from "@/components/games/open-lobbies";
import { QuickJoinButton } from "@/components/games/quick-join-button";
import { YourMatches } from "@/components/games/your-matches";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { gamesApi } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function GamesPage() {
	const router = useRouter();
	const { data: session, isPending: sessionPending } = useSession();
	const [code, setCode] = useState("");
	const [searchError, setSearchError] = useState<string | null>(null);

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
			<main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
				<header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="font-mono text-[11px] text-primary uppercase tracking-[0.18em]">
							Operations
						</p>
						<h1 className="mt-1 font-display text-3xl tracking-tight">Games</h1>
						<p className="mt-1 text-muted-foreground text-sm">
							Resume an active match, find one by code, or jump into the next open lobby.
						</p>
					</div>
					<div className="flex flex-shrink-0 gap-2">
						<QuickJoinButton />
						<Button variant="secondary" onClick={() => create.mutate()} disabled={create.isPending}>
							{create.isPending ? "Creating…" : "New game"}
						</Button>
					</div>
				</header>

				<form
					className="flex flex-col gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						setSearchError(null);
						findByCode.mutate(code);
					}}
				>
					<label
						htmlFor="game-code"
						className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]"
					>
						Find by code
					</label>
					<div className="flex gap-2">
						<Input
							id="game-code"
							placeholder="ABCDEFGH"
							value={code}
							onChange={(e) => setCode(e.target.value.toUpperCase())}
							maxLength={8}
							className="font-mono uppercase tracking-[0.18em]"
						/>
						<Button
							type="submit"
							variant="secondary"
							disabled={code.length !== 8 || findByCode.isPending}
						>
							Find
						</Button>
					</div>
					{searchError && (
						<p className="font-mono text-[11px] text-destructive uppercase tracking-[0.06em]">
							{searchError}
						</p>
					)}
				</form>

				<YourMatches />

				<OpenLobbies />
			</main>
		</>
	);
}
