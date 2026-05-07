"use client";

import { AlliancesTab } from "@/components/diplomacy/alliances-tab";
import { MessagesTab } from "@/components/diplomacy/messages-tab";
import { NationsTab } from "@/components/diplomacy/nations-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import {
	type DiplomacySnapshot,
	type DiplomacyTreaty,
	gamesApi,
	queryKeys,
	worldApi,
} from "@/lib/api-client";
import type { GameSnapshot } from "@geopolitik/shared/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/*
 * Diplomacy drawer — Phase 6a foundation.
 *
 * Bottom drawer matching the Phase 4 Research drawer's shell. Four tabs
 * scaffolded with empty-state placeholders; each tab fills in across
 * later slices:
 *   - Nations  → 6b
 *   - Alliances → 6c
 *   - Treaties + war → 6d (lives across Nations + a treaty inbox)
 *   - Messages → 6e
 *   - Trades   → 6f
 *
 * The trigger button carries two notification badge stubs:
 *   - red dot for unresolved proposals (set by 6c–6d/6f)
 *   - amber dot for unread messages (set by 6e)
 * Both are wired but always hidden in 6a — they become live once their
 * data sources arrive.
 */

type DiplomacyTab = "nations" | "alliances" | "messages" | "trades";

const TAB_LABELS: Record<DiplomacyTab, string> = {
	nations: "Nations",
	alliances: "Alliances",
	messages: "Messages",
	trades: "Trades",
};

const TAB_ORDER: DiplomacyTab[] = ["nations", "alliances", "messages", "trades"];

export interface DiplomacyDrawerProps {
	gameId: string;
	mePlayerId: string | null;
	/** Reserved for 6c–6f: count of unresolved proposals (treaties + alliance apps + trade offers). */
	pendingProposalCount?: number;
	/** Reserved for 6e: total unread DMs + alliance + broadcast messages. */
	unreadMessageCount?: number;
}

export function DiplomacyDrawer({
	gameId,
	mePlayerId,
	pendingProposalCount,
	unreadMessageCount,
}: DiplomacyDrawerProps) {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<DiplomacyTab>("nations");

	const snapshot = useQuery({
		queryKey: queryKeys.gameSnapshot(gameId),
		queryFn: () => gamesApi.snapshot(gameId),
		enabled: open,
	});
	const world = useQuery({
		queryKey: queryKeys.worldCities,
		queryFn: worldApi.cities,
		staleTime: 60 * 60 * 1000,
		enabled: open,
	});
	// Always poll diplomacy lightly so the badge is live even before the
	// drawer is opened. Lightweight enough — one query per ~30s window.
	const diplomacy = useQuery({
		queryKey: queryKeys.gameDiplomacy(gameId),
		queryFn: () => gamesApi.diplomacy(gameId),
		enabled: !!mePlayerId,
		staleTime: 15_000,
	});

	const proposalCount =
		pendingProposalCount ??
		(diplomacy.data
			? diplomacy.data.incomingTreaties.length +
				diplomacy.data.incomingTrades.length +
				diplomacy.data.incomingApps.length
			: 0);
	const unreadCount =
		unreadMessageCount ?? (diplomacy.data ? totalUnread(diplomacy.data, mePlayerId) : 0);

	const showProposalDot = proposalCount > 0;
	const showUnreadDot = unreadCount > 0;

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button variant="ghost" size="sm" className="relative h-7 px-2">
					<Handshake className="size-3.5" />
					<span className="font-mono text-[10px] uppercase tracking-[0.18em]">Diplomacy</span>
					{showProposalDot && (
						<span
							aria-label={`${proposalCount} pending proposals`}
							className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive"
						/>
					)}
					{showUnreadDot && !showProposalDot && (
						<span
							aria-label={`${unreadCount} unread messages`}
							className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-[var(--color-warn)]"
						/>
					)}
				</Button>
			</SheetTrigger>
			<SheetContent
				side="bottom"
				className="flex h-[100vh] flex-col gap-0 border-t-2 border-border bg-background p-0"
			>
				<SheetHeader className="flex flex-row items-baseline justify-between border-b border-border p-3">
					<div className="flex flex-col gap-0.5">
						<SheetTitle className="font-mono text-sm uppercase tracking-[0.18em]">
							Diplomacy Command
						</SheetTitle>
						<SheetDescription className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							Foreign relations · alliances · messaging · trade
						</SheetDescription>
					</div>
				</SheetHeader>

				{/* Tab nav */}
				<nav className="flex border-b border-border bg-card">
					{TAB_ORDER.map((id) => {
						const active = tab === id;
						return (
							<button
								type="button"
								key={id}
								onClick={() => setTab(id)}
								className={`flex-1 border-r border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors last:border-r-0 ${
									active
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
								}`}
								aria-pressed={active}
							>
								{TAB_LABELS[id]}
							</button>
						);
					})}
				</nav>

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					{tab === "nations" && (
						<>
							<TreatyInbox
								gameId={gameId}
								diplomacy={diplomacy.data}
								gameSnapshot={snapshot.data}
								currentTick={snapshot.data?.game.tick ?? 0}
							/>
							<NationsTab gameId={gameId} snapshot={snapshot.data} world={world.data} />
						</>
					)}
					{tab === "alliances" && (
						<AlliancesTab
							gameId={gameId}
							snapshot={diplomacy.data}
							gameSnapshot={snapshot.data}
							currentTick={snapshot.data?.game.tick ?? 0}
						/>
					)}
					{tab === "messages" && (
						<MessagesTab gameId={gameId} diplomacy={diplomacy.data} gameSnapshot={snapshot.data} />
					)}
					{tab === "trades" && <TradesTabPlaceholder />}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function EmptyTab({ title, body }: { title: string; body: string }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2 p-12 text-center">
			<span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
				{title}
			</span>
			<span className="max-w-md font-mono text-[11px] leading-relaxed text-muted-foreground/70">
				{body}
			</span>
		</div>
	);
}

function TradesTabPlaceholder() {
	return (
		<EmptyTab
			title="Trades — coming in Phase 6f"
			body="Free-form atomic resource trades. Pick give and receive bundles freely; settle in one tick when both sides accept."
		/>
	);
}

function TreatyInbox({
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
		mutationFn: (vars: { treatyId: string; action: "accept" | "reject" }) =>
			gamesApi.submitOrder(gameId, {
				kind: "respond_treaty",
				payload: { treatyId: vars.treatyId, action: vars.action },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Response rejected"),
	});

	const breakTreaty = useMutation({
		mutationFn: (treatyId: string) =>
			gamesApi.submitOrder(gameId, {
				kind: "break_treaty",
				payload: { treatyId },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Break rejected"),
	});

	if (!diplomacy || !gameSnapshot) return null;
	const incoming = diplomacy.incomingTreaties;
	const outgoing = diplomacy.outgoingTreaties;
	const active = diplomacy.activeTreaties;
	const wars = diplomacy.wars;
	if (incoming.length + outgoing.length + active.length + wars.length === 0) return null;

	const playerName = (id: string) =>
		gameSnapshot.players.find((p) => p.id === id)?.displayName ?? id.slice(0, 8);

	return (
		<section className="border-b border-border bg-card/40 px-3 py-3">
			<div className="mb-2 flex items-baseline justify-between">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
					Treaty + war inbox
				</span>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					tick #{currentTick}
				</span>
			</div>

			{incoming.length > 0 && (
				<div className="flex flex-col gap-1">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Incoming · {incoming.length}
					</span>
					{incoming.map((t) => (
						<TreatyRow
							key={t.id}
							treaty={t}
							direction="incoming"
							otherName={playerName(t.proposerId)}
							currentTick={currentTick}
							onAccept={() => respond.mutate({ treatyId: t.id, action: "accept" })}
							onReject={() => respond.mutate({ treatyId: t.id, action: "reject" })}
							busy={respond.isPending}
						/>
					))}
				</div>
			)}
			{outgoing.length > 0 && (
				<div className="mt-2 flex flex-col gap-1">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Outgoing · {outgoing.length}
					</span>
					{outgoing.map((t) => (
						<TreatyRow
							key={t.id}
							treaty={t}
							direction="outgoing"
							otherName={playerName(t.targetId)}
							currentTick={currentTick}
							busy={false}
						/>
					))}
				</div>
			)}
			{active.length > 0 && (
				<div className="mt-2 flex flex-col gap-1">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Active · {active.length}
					</span>
					{active.map((t) => {
						const other = t.proposerId === gameSnapshot.mePlayerId ? t.targetId : t.proposerId;
						return (
							<TreatyRow
								key={t.id}
								treaty={t}
								direction="active"
								otherName={playerName(other)}
								currentTick={currentTick}
								onBreak={
									t.type === "forced_non_aggression" ? undefined : () => breakTreaty.mutate(t.id)
								}
								busy={breakTreaty.isPending}
							/>
						);
					})}
				</div>
			)}
			{wars.length > 0 && (
				<div className="mt-2 flex flex-col gap-1">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-destructive">
						Active wars · {wars.length}
					</span>
					{wars.map((w) => (
						<div
							key={w.id}
							className="flex items-center justify-between border border-destructive/40 bg-destructive/5 px-3 py-1.5 font-mono text-[11px]"
						>
							<span className="text-foreground">
								{w.attackerId === gameSnapshot.mePlayerId
									? `Attacking ${playerName(w.defenderId)}`
									: `Attacked by ${playerName(w.attackerId)}`}
							</span>
							<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
								{w.fromDefensivePact ? "auto-pact" : "declared"} · tick {w.declaredAtTick}
							</span>
						</div>
					))}
				</div>
			)}
		</section>
	);
}

function TreatyRow({
	treaty,
	direction,
	otherName,
	currentTick,
	onAccept,
	onReject,
	onBreak,
	busy,
}: {
	treaty: DiplomacyTreaty;
	direction: "incoming" | "outgoing" | "active";
	otherName: string;
	currentTick: number;
	onAccept?: () => void;
	onReject?: () => void;
	onBreak?: () => void;
	busy: boolean;
}) {
	const isCooling = treaty.type === "forced_non_aggression";
	return (
		<div className="flex items-center justify-between border border-border bg-card px-3 py-1.5 font-mono text-[11px]">
			<div className="flex items-center gap-2">
				<TreatyTypeBadge type={treaty.type} />
				<span className="text-foreground">{otherName}</span>
				{isCooling && treaty.expiresAtTick && (
					<span className="text-muted-foreground">
						clears in {Math.max(0, treaty.expiresAtTick - currentTick)}t
					</span>
				)}
				{direction !== "active" && treaty.expiresAtTick && (
					<span className="text-muted-foreground">
						expires in {Math.max(0, treaty.expiresAtTick - currentTick)}t
					</span>
				)}
				{treaty.note && <span className="truncate text-muted-foreground">· "{treaty.note}"</span>}
			</div>
			<div className="flex gap-1">
				{direction === "incoming" && (
					<>
						<Button size="xs" variant="primary" onClick={onAccept} disabled={busy}>
							Accept
						</Button>
						<Button size="xs" variant="destructive" onClick={onReject} disabled={busy}>
							Reject
						</Button>
					</>
				)}
				{direction === "active" && onBreak && (
					<Button size="xs" variant="destructive" onClick={onBreak} disabled={busy}>
						Break
					</Button>
				)}
			</div>
		</div>
	);
}

/**
 * Sum of unread messages across DM, alliance, and broadcast channels.
 * Walks the player's `message_read` markers and counts every message
 * newer than the marker that wasn't sent by the player.
 */
function totalUnread(snap: DiplomacySnapshot, myId: string | null): number {
	if (!myId) return 0;
	const newerThan = (
		msgs: { id: string; senderId: string; sentAtTick: number }[],
		lastSeenId: string | undefined,
	) => {
		if (!lastSeenId) return msgs.filter((m) => m.senderId !== myId).length;
		const sortedAsc = [...msgs].sort((a, b) => a.sentAtTick - b.sentAtTick);
		const idx = sortedAsc.findIndex((m) => m.id === lastSeenId);
		if (idx === -1) return sortedAsc.filter((m) => m.senderId !== myId).length;
		return sortedAsc.slice(idx + 1).filter((m) => m.senderId !== myId).length;
	};
	const broadcastSeen = snap.messages.reads.find(
		(r) => r.channel === "broadcast" && r.peerKey === "g",
	)?.lastSeenMessageId;
	let total = newerThan(snap.messages.broadcast, broadcastSeen);
	if (snap.myAlliance) {
		const aKey = `a:${snap.myAlliance.id}`;
		const seen = snap.messages.reads.find(
			(r) => r.channel === "alliance" && r.peerKey === aKey,
		)?.lastSeenMessageId;
		total += newerThan(snap.messages.alliance, seen);
	}
	const peerMap = new Map<string, typeof snap.messages.dms>();
	for (const m of snap.messages.dms) {
		const peer = m.senderId === myId ? m.recipientPlayerId : m.senderId;
		if (!peer) continue;
		const arr = peerMap.get(peer) ?? [];
		arr.push(m);
		peerMap.set(peer, arr);
	}
	for (const [peer, msgs] of peerMap) {
		const seen = snap.messages.reads.find(
			(r) => r.channel === "dm" && r.peerKey === `p:${peer}`,
		)?.lastSeenMessageId;
		total += newerThan(msgs, seen);
	}
	return total;
}

function TreatyTypeBadge({ type }: { type: DiplomacyTreaty["type"] }) {
	const labels: Record<
		DiplomacyTreaty["type"],
		{ label: string; variant: "default" | "info" | "ok" | "warn" | "crit" }
	> = {
		non_aggression: { label: "Non-aggression", variant: "info" },
		defensive_pact: { label: "Defensive pact", variant: "ok" },
		trade_route: { label: "Trade route", variant: "default" },
		military_access: { label: "Mil. access", variant: "info" },
		coalition_war: { label: "Coalition war", variant: "warn" },
		forced_non_aggression: { label: "Cooling pact", variant: "warn" },
	};
	const { label, variant } = labels[type];
	return (
		<Badge variant={variant} size="sm">
			{label}
		</Badge>
	);
}
