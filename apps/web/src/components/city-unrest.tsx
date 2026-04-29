"use client";

import type { GameSnapshot } from "@geopolitik/shared/api";
import { NATION_POLICY } from "@geopolitik/shared/policy";
import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";

/*
 * Unrest panel — Phase 3e.
 *
 * Renders the score, per-slider attribution, and (when in revolt) the
 * defection countdown. Math mirrors apps/api computeUnrestDelta so the UI
 * preview matches what the next tick will write — single source of truth in
 * nation-policy.json#unrest.
 */

const DEFECTION_TICKS = 1440;
const TICK_SECONDS = 30;

function fmtRemaining(ticks: number): string {
	const seconds = ticks * TICK_SECONDS;
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(seconds / 3600);
	const remMin = Math.floor((seconds % 3600) / 60);
	return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}

function unrestColor(unrest: number): { text: string; bg: string; ring?: string } {
	if (unrest >= 100) {
		return {
			text: "text-destructive",
			bg: "bg-destructive/30",
			ring: "ring-2 ring-destructive animate-pulse",
		};
	}
	if (unrest >= 80) return { text: "text-destructive", bg: "bg-destructive/20" };
	if (unrest >= 40) return { text: "text-amber-500", bg: "bg-amber-500/15" };
	return { text: "text-primary", bg: "bg-primary/15" };
}

export function CityUnrestSection({
	cityId,
	snapshot,
}: {
	cityId: string;
	snapshot: GameSnapshot;
}) {
	const cs = useMemo(
		() => snapshot.cityState.find((s) => s.cityId === cityId),
		[snapshot.cityState, cityId],
	);
	const me = useMemo(
		() => snapshot.nationState.find((n) => n.playerId === snapshot.mePlayerId),
		[snapshot.nationState, snapshot.mePlayerId],
	);

	if (!cs || !me) return null;

	const unrest = cs.unrest;
	const u = NATION_POLICY.unrest;
	const taxationDelta =
		Math.max(0, me.taxation - u.defaultsTaxation) * u.taxationPerNotchAboveDefault;
	const welfareDelta = Math.max(0, u.defaultsWelfare - me.welfare) * u.welfarePerNotchBelowDefault;
	const propagandaDelta = -me.propaganda * u.propagandaPerNotch;
	const net = taxationDelta + welfareDelta + propagandaDelta;
	const colors = unrestColor(unrest);

	const ticksUntilDefection =
		cs.inRevoltSinceTick !== null
			? Math.max(0, DEFECTION_TICKS - (snapshot.game.tick - cs.inRevoltSinceTick))
			: null;

	return (
		<div className="border border-dashed border-border bg-card/40">
			<div className="flex items-center justify-between border-b border-border bg-card/60 px-3 py-1.5">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
					Unrest
				</span>
				<span className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
					0 — 100
				</span>
			</div>

			{/* Score block */}
			<div className="flex items-baseline gap-3 px-3 py-3">
				<div
					className={`flex h-12 w-16 items-center justify-center font-mono text-2xl tabular-nums ${colors.text} ${colors.bg} ${colors.ring ?? ""}`}
				>
					{unrest}
				</div>
				<div className="flex flex-col">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Per tick
					</span>
					<span
						className={`font-mono text-sm tabular-nums ${net > 0 ? "text-destructive" : net < 0 ? "text-primary" : "text-foreground"}`}
					>
						{net > 0 ? "+" : ""}
						{net}
					</span>
				</div>
			</div>

			{/* Revolt banner */}
			{cs.inRevoltSinceTick !== null && ticksUntilDefection !== null && (
				<div className="flex items-baseline justify-between gap-2 border-y border-destructive/40 bg-destructive/10 px-3 py-2">
					<span className="inline-flex items-baseline gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-destructive">
						<AlertTriangle className="size-3 self-center" aria-hidden />
						In revolt
					</span>
					<span className="font-mono text-[10px] tabular-nums text-destructive">
						Defects in {ticksUntilDefection}t · {fmtRemaining(ticksUntilDefection)}
					</span>
				</div>
			)}

			{/* Per-slider attribution */}
			<dl className="grid grid-cols-[1fr_auto] gap-y-0.5 px-3 py-3 font-mono text-[11px] tabular-nums">
				<dt className="text-muted-foreground">Taxation</dt>
				<dd className={taxationDelta > 0 ? "text-destructive" : "text-muted-foreground/60"}>
					{taxationDelta > 0 ? "+" : ""}
					{taxationDelta}
				</dd>
				<dt className="text-muted-foreground">Welfare</dt>
				<dd className={welfareDelta > 0 ? "text-destructive" : "text-muted-foreground/60"}>
					{welfareDelta > 0 ? "+" : ""}
					{welfareDelta}
				</dd>
				<dt className="text-muted-foreground">Propaganda</dt>
				<dd className={propagandaDelta < 0 ? "text-primary" : "text-muted-foreground/60"}>
					{propagandaDelta}
				</dd>
				<dt className="border-t border-border pt-1 text-foreground">Net / tick</dt>
				<dd
					className={`border-t border-border pt-1 ${net > 0 ? "text-destructive" : net < 0 ? "text-primary" : "text-foreground"}`}
				>
					{net > 0 ? "+" : ""}
					{net}
				</dd>
			</dl>

			{cs.inRevoltSinceTick !== null && (
				<p className="border-t border-border px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
					Production halted while in revolt. Drop unrest below 100 to reset the defection timer;
					otherwise the city flips to neutral.
				</p>
			)}
		</div>
	);
}
