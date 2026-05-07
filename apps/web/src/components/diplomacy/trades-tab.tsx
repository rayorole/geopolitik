"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	type DiplomacySnapshot,
	type DiplomacyTradeProposal,
	gamesApi,
	queryKeys,
} from "@/lib/api-client";
import type { GameSnapshot } from "@geopolitik/shared/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Check, X } from "lucide-react";
import { toast } from "sonner";

/*
 * Trades tab — Phase 6f.
 *
 * Renders Incoming + Outgoing pending trade proposals plus a sticky
 * inventory bar at the top so the player can read their own balances
 * while reviewing offers. New proposals are submitted from the Nations
 * tab's "Propose Trade" action modal (wired in 6d) — atomic settlement
 * happens server-side under the per-game tx lock when the recipient
 * accepts.
 *
 * No history pane in this slice; resolved trades are still queryable
 * via the diplomacy snapshot (status = accepted | rejected | expired)
 * but the UI defers them to a follow-up.
 */

const RES_DIVISOR = 100;
const fmtRes = (n: number) =>
	(n / RES_DIVISOR).toLocaleString(undefined, { maximumFractionDigits: 1 });

export function TradesTab({
	gameId,
	diplomacy,
	gameSnapshot,
	currentTick,
}: {
	gameId: string;
	diplomacy: DiplomacySnapshot | undefined;
	gameSnapshot: GameSnapshot | undefined;
	currentTick: number;
}) {
	const queryClient = useQueryClient();

	const respond = useMutation({
		mutationFn: (vars: { proposalId: string; action: "accept" | "reject" }) =>
			gamesApi.submitOrder(gameId, {
				kind: "respond_trade",
				payload: vars,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Trade response rejected"),
	});

	if (!diplomacy || !gameSnapshot) {
		return (
			<div className="flex items-center justify-center py-12 font-mono text-xs text-muted-foreground">
				Loading…
			</div>
		);
	}

	const myId = gameSnapshot.mePlayerId;
	const playerById = new Map(gameSnapshot.players.map((p) => [p.id, p]));
	const myNation = gameSnapshot.nationState.find((n) => n.playerId === myId) ?? null;

	return (
		<div className="flex flex-col">
			{/* Sticky inventory bar */}
			<section className="grid grid-cols-4 border-b border-border bg-card">
				{(
					[
						["Money", myNation?.money ?? 0],
						["Oil", myNation?.oil ?? 0],
						["Steel", myNation?.steel ?? 0],
						["Electronics", myNation?.electronics ?? 0],
					] as const
				).map(([label, val]) => (
					<div
						key={label}
						className="flex flex-col gap-0.5 border-r border-border px-3 py-2 last:border-r-0"
					>
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
							{label}
						</span>
						<span className="font-mono text-sm tabular-nums text-foreground">{fmtRes(val)}</span>
					</div>
				))}
			</section>

			<div className="flex flex-col gap-4 p-3">
				<TradeSection
					title="Incoming · awaiting your response"
					proposals={diplomacy.incomingTrades}
					direction="incoming"
					playerById={playerById}
					currentTick={currentTick}
					onAccept={(id) => respond.mutate({ proposalId: id, action: "accept" })}
					onReject={(id) => respond.mutate({ proposalId: id, action: "reject" })}
					busy={respond.isPending}
					emptyText="No incoming offers."
				/>
				<TradeSection
					title="Outgoing · pending recipient"
					proposals={diplomacy.outgoingTrades}
					direction="outgoing"
					playerById={playerById}
					currentTick={currentTick}
					busy={false}
					emptyText="No outgoing offers."
				/>
			</div>

			<div className="border-t border-border bg-card/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
				Propose new trade from a player-held nation card in the Nations tab.
			</div>
		</div>
	);
}

function TradeSection({
	title,
	proposals,
	direction,
	playerById,
	currentTick,
	onAccept,
	onReject,
	busy,
	emptyText,
}: {
	title: string;
	proposals: DiplomacyTradeProposal[];
	direction: "incoming" | "outgoing";
	playerById: Map<string, GameSnapshot["players"][number]>;
	currentTick: number;
	onAccept?: (id: string) => void;
	onReject?: (id: string) => void;
	busy: boolean;
	emptyText: string;
}) {
	return (
		<section className="flex flex-col gap-1">
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
				{title} · {proposals.length}
			</span>
			{proposals.length === 0 ? (
				<span className="px-3 py-3 font-mono text-[11px] text-muted-foreground/70">
					{emptyText}
				</span>
			) : (
				<div className="flex flex-col gap-1">
					{proposals.map((p) => {
						const peer = playerById.get(direction === "incoming" ? p.proposerId : p.targetId);
						return (
							<TradeRow
								key={p.id}
								proposal={p}
								direction={direction}
								peerName={peer?.displayName ?? p.proposerId.slice(0, 8)}
								peerCountry={peer?.countryCode ?? "—"}
								currentTick={currentTick}
								onAccept={onAccept ? () => onAccept(p.id) : undefined}
								onReject={onReject ? () => onReject(p.id) : undefined}
								busy={busy}
							/>
						);
					})}
				</div>
			)}
		</section>
	);
}

function TradeRow({
	proposal,
	direction,
	peerName,
	peerCountry,
	currentTick,
	onAccept,
	onReject,
	busy,
}: {
	proposal: DiplomacyTradeProposal;
	direction: "incoming" | "outgoing";
	peerName: string;
	peerCountry: string;
	currentTick: number;
	onAccept?: () => void;
	onReject?: () => void;
	busy: boolean;
}) {
	const expiresIn = Math.max(0, proposal.expiresAtTick - currentTick);
	return (
		<article className="flex flex-col gap-2 border border-border bg-card p-3">
			<header className="flex items-baseline justify-between gap-2">
				<span className="font-mono text-[12px] text-foreground">
					{direction === "incoming" ? `From ${peerName}` : `To ${peerName}`}
					<span className="ml-1 text-muted-foreground">· {peerCountry}</span>
				</span>
				<Badge variant="default" size="sm">
					expires {expiresIn}t
				</Badge>
			</header>

			<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
				<BundleSummary
					label={direction === "incoming" ? "They give" : "You give"}
					money={proposal.giveMoney}
					oil={proposal.giveOil}
					steel={proposal.giveSteel}
					electronics={proposal.giveElectronics}
				/>
				<ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden />
				<BundleSummary
					label={direction === "incoming" ? "They want" : "You receive"}
					money={proposal.receiveMoney}
					oil={proposal.receiveOil}
					steel={proposal.receiveSteel}
					electronics={proposal.receiveElectronics}
				/>
			</div>

			{proposal.note && (
				<p className="font-mono text-[11px] leading-snug text-muted-foreground">
					"{proposal.note}"
				</p>
			)}

			{direction === "incoming" && onAccept && onReject && (
				<div className="flex justify-end gap-1">
					<Button size="xs" variant="primary" onClick={onAccept} disabled={busy}>
						<Check />
						Accept
					</Button>
					<Button size="xs" variant="destructive" onClick={onReject} disabled={busy}>
						<X />
						Reject
					</Button>
				</div>
			)}
		</article>
	);
}

function BundleSummary({
	label,
	money,
	oil,
	steel,
	electronics,
}: {
	label: string;
	money: number;
	oil: number;
	steel: number;
	electronics: number;
}) {
	const cells: { name: string; v: number }[] = [
		{ name: "$", v: money },
		{ name: "Oil", v: oil },
		{ name: "Steel", v: steel },
		{ name: "Chip", v: electronics },
	];
	return (
		<div className="flex flex-col gap-0.5">
			<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
				{label}
			</span>
			<div className="grid grid-cols-2 gap-x-2 gap-y-0">
				{cells
					.filter((c) => c.v > 0)
					.map((c) => (
						<div
							key={c.name}
							className="flex items-baseline gap-1 font-mono text-[11px] text-foreground tabular-nums"
						>
							<span className="text-muted-foreground">{c.name}</span>
							<span>{(c.v / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
						</div>
					))}
				{cells.every((c) => c.v === 0) && (
					<span className="font-mono text-[10px] text-muted-foreground/70">none</span>
				)}
			</div>
		</div>
	);
}
