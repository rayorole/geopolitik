"use client";

import { NationFlag } from "@/components/nation-flag";
import { gamesApi, queryKeys } from "@/lib/api-client";
import type { MineGameSummary } from "@geopolitik/shared/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Flame, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const TICK_INTERVAL_MS = 30_000;

export function YourMatches() {
	const { data, isLoading } = useQuery({
		queryKey: queryKeys.gamesMine,
		queryFn: gamesApi.mine,
		refetchInterval: 10_000,
	});

	if (isLoading || !data || data.length === 0) return null;

	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
				Your matches · {data.length}
			</h2>
			<ul className="flex flex-col gap-2">
				{data.map((g) => (
					<YourMatchCard key={g.gameId} g={g} />
				))}
			</ul>
		</section>
	);
}

function YourMatchCard({ g }: { g: MineGameSummary }) {
	const [seconds, setSeconds] = useState(() => secondsUntilNextTick(g.lastTickAt));

	useEffect(() => {
		setSeconds(secondsUntilNextTick(g.lastTickAt));
		const id = setInterval(() => setSeconds(secondsUntilNextTick(g.lastTickAt)), 1000);
		return () => clearInterval(id);
	}, [g.lastTickAt]);

	const unrest = unrestSummary(g.topUnrestCity);

	return (
		<li>
			<Link
				href={`/play/${g.gameId}`}
				className="group flex items-center justify-between gap-4 border border-border bg-card px-4 py-4 transition-colors hover:border-primary"
			>
				<div className="flex min-w-0 items-center gap-4">
					<NationFlag
						code={g.country.code}
						title={g.country.name}
						className="h-7 w-10 flex-shrink-0"
					/>
					<div className="flex min-w-0 flex-col gap-1.5">
						<div className="flex items-baseline gap-3">
							<span className="font-display font-medium text-base tracking-tight">
								{g.country.name}
							</span>
							<code className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
								{g.code}
							</code>
						</div>
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
							<span className="flex items-center gap-1">
								<Users className="h-3.5 w-3.5" /> {g.playerCount}
							</span>
							<span>
								tick #{g.tick.toLocaleString()} · next in {seconds}s
							</span>
							{unrest ? (
								<span className={`flex items-center gap-1 ${unrest.cls}`}>
									<Flame className="h-3.5 w-3.5" /> {unrest.text}
								</span>
							) : null}
						</div>
					</div>
				</div>
				<span className="flex flex-shrink-0 items-center gap-1 font-mono text-primary text-xs uppercase tracking-[0.18em]">
					Resume
					<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
				</span>
			</Link>
		</li>
	);
}

function secondsUntilNextTick(lastTickAt: string): number {
	const ms = new Date(lastTickAt).getTime() + TICK_INTERVAL_MS - Date.now();
	return Math.max(0, Math.ceil(ms / 1000));
}

function unrestSummary(
	city: MineGameSummary["topUnrestCity"],
): { text: string; cls: string } | null {
	if (!city) return null;
	if (city.inRevolt) return { text: `${city.name} in revolt`, cls: "text-crit" };
	if (city.unrest >= 80) return { text: `${city.name} ${city.unrest}%`, cls: "text-crit" };
	if (city.unrest >= 40) return { text: `${city.name} ${city.unrest}%`, cls: "text-warn" };
	return null;
}
