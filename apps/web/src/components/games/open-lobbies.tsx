"use client";

import { gamesApi, queryKeys } from "@/lib/api-client";
import type { GameSummary } from "@geopolitik/shared/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Users } from "lucide-react";
import Link from "next/link";

export function OpenLobbies() {
	const { data, isLoading } = useQuery({
		queryKey: queryKeys.gamesBrowse,
		queryFn: gamesApi.browse,
		refetchInterval: 5_000,
	});

	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
				Open lobbies · {data?.length ?? 0}
			</h2>
			{isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
			{data && data.length === 0 && (
				<p className="text-muted-foreground text-sm">No open lobbies. Create one above.</p>
			)}
			<ul className="flex flex-col gap-2">
				{data?.map((g) => (
					<LobbyCard key={g.id} g={g} />
				))}
			</ul>
		</section>
	);
}

function LobbyCard({ g }: { g: GameSummary }) {
	const totalCountries = g.playerCount + g.unclaimedCountryCount;
	const inProgress = g.tick > 0;

	return (
		<li>
			<Link
				href={`/games/${g.id}/join`}
				className="group flex items-center justify-between gap-4 border border-border bg-card px-4 py-4 transition-colors hover:border-primary"
			>
				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex flex-wrap items-center gap-3">
						<code className="font-mono text-base text-primary tracking-[0.18em]">{g.code}</code>
						<span
							className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
								inProgress ? "border-warn text-warn" : "border-ok text-ok"
							}`}
						>
							{inProgress ? `In progress · #${g.tick}` : "Open"}
						</span>
					</div>
					<div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
						<span className="flex items-center gap-1">
							<Users className="h-3.5 w-3.5" />
							<span className="text-foreground">
								{g.playerCount}
								<span className="text-muted-foreground">/{totalCountries}</span>
							</span>
						</span>
					</div>
				</div>
				<span className="flex flex-shrink-0 items-center gap-1 font-mono text-primary text-xs uppercase tracking-[0.18em]">
					Join
					<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
				</span>
			</Link>
		</li>
	);
}
