"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	type DiplomacyMessage,
	type DiplomacySnapshot,
	gamesApi,
	queryKeys,
} from "@/lib/api-client";
import { ALPHA3_TO_ALPHA2 } from "@/lib/country-flags";
import type { GameSnapshot } from "@geopolitik/shared/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, Users } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/*
 * Messages tab — Phase 6e.
 *
 * Three-pane Discord-style layout:
 *   - Sidebar: pinned Broadcast + Alliance (when member) channels, then DM
 *     contacts (any player you've exchanged a message with, plus all other
 *     players you can DM).
 *   - Conversation view: scrollable history of the selected channel.
 *   - Composer: textarea + Send button. 2000 char max enforced client-side
 *     to match the server cap.
 *
 * Read tracking: on selecting a channel we submit `mark_read` keyed by
 * (channel, peerKey, lastMessageId) so the unread badge clears.
 *
 * No realtime delivery yet — the snapshot is invalidated after each send
 * and after mark_read, which fetches the merged history on next open.
 * WS push delivery is a follow-up enhancement that doesn't change the
 * data model.
 */

type SelectedChannel =
	| { kind: "broadcast" }
	| { kind: "alliance"; allianceId: string }
	| { kind: "dm"; peerId: string };

function peerKeyFor(sel: SelectedChannel): string {
	if (sel.kind === "broadcast") return "g";
	if (sel.kind === "alliance") return `a:${sel.allianceId}`;
	return `p:${sel.peerId}`;
}

export function MessagesTab({
	gameId,
	diplomacy,
	gameSnapshot,
}: {
	gameId: string;
	diplomacy: DiplomacySnapshot | undefined;
	gameSnapshot: GameSnapshot | undefined;
}) {
	const [selected, setSelected] = useState<SelectedChannel>({ kind: "broadcast" });
	const [body, setBody] = useState("");
	const queryClient = useQueryClient();

	const send = useMutation({
		mutationFn: () => {
			const trimmed = body.trim();
			if (!trimmed) throw new Error("Empty message");
			if (selected.kind === "dm") {
				return gamesApi.submitOrder(gameId, {
					kind: "send_message",
					payload: { channel: "dm", recipientPlayerId: selected.peerId, body: trimmed },
				});
			}
			if (selected.kind === "alliance") {
				return gamesApi.submitOrder(gameId, {
					kind: "send_message",
					payload: {
						channel: "alliance",
						recipientAllianceId: selected.allianceId,
						body: trimmed,
					},
				});
			}
			return gamesApi.submitOrder(gameId, {
				kind: "send_message",
				payload: { channel: "broadcast", body: trimmed },
			});
		},
		onSuccess: () => {
			setBody("");
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Send rejected"),
	});

	const markRead = useMutation({
		mutationFn: (vars: {
			channel: "dm" | "alliance" | "broadcast";
			peerKey: string;
			lastMessageId: string;
		}) =>
			gamesApi.submitOrder(gameId, {
				kind: "mark_read",
				payload: vars,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
		},
	});

	if (!diplomacy || !gameSnapshot) {
		return (
			<div className="flex items-center justify-center py-12 font-mono text-xs text-muted-foreground">
				Loading…
			</div>
		);
	}

	const myId = gameSnapshot.mePlayerId ?? "";
	const playerById = new Map(gameSnapshot.players.map((p) => [p.id, p]));

	// Build DM contact list — every player you've exchanged a message with plus
	// every other player in the game.
	const dmContacts = useMemo(() => {
		const ids = new Set<string>();
		for (const m of diplomacy.messages.dms) {
			const otherId = m.senderId === myId ? m.recipientPlayerId : m.senderId;
			if (otherId && otherId !== myId) ids.add(otherId);
		}
		for (const p of gameSnapshot.players) {
			if (p.id !== myId) ids.add(p.id);
		}
		return [...ids]
			.map((id) => playerById.get(id))
			.filter((p): p is NonNullable<typeof p> => !!p)
			.sort((a, b) => a.displayName.localeCompare(b.displayName));
	}, [diplomacy.messages.dms, gameSnapshot.players, myId, playerById]);

	const conversation = useMemo<DiplomacyMessage[]>(() => {
		if (selected.kind === "broadcast") {
			return [...diplomacy.messages.broadcast].reverse();
		}
		if (selected.kind === "alliance") {
			return [...diplomacy.messages.alliance].reverse();
		}
		return [...diplomacy.messages.dms]
			.filter(
				(m) =>
					(m.senderId === myId && m.recipientPlayerId === selected.peerId) ||
					(m.senderId === selected.peerId && m.recipientPlayerId === myId),
			)
			.reverse();
	}, [selected, diplomacy.messages, myId]);

	const lastMessage = conversation[conversation.length - 1];

	const lastMessageId = lastMessage?.id;
	const peerKey = peerKeyFor(selected);
	const lastSeenForPeer = diplomacy.messages.reads.find(
		(r) => r.channel === selected.kind && r.peerKey === peerKey,
	)?.lastSeenMessageId;
	useEffect(() => {
		if (!lastMessageId || markRead.isPending) return;
		if (lastSeenForPeer === lastMessageId) return;
		markRead.mutate({ channel: selected.kind, peerKey, lastMessageId });
	}, [lastMessageId, selected.kind, peerKey, lastSeenForPeer, markRead]);

	const unreadCounts = useMemo(() => computeUnreadCounts(diplomacy, myId), [diplomacy, myId]);

	const allianceId = diplomacy.myAlliance?.id ?? null;

	return (
		<div className="grid h-full grid-cols-[200px_1fr] gap-0">
			{/* Channel sidebar */}
			<aside className="flex min-h-0 flex-col border-r border-border bg-card/40">
				<ChannelEntry
					label="Broadcast"
					iconNode={<Megaphone className="size-3.5" />}
					active={selected.kind === "broadcast"}
					unread={unreadCounts.broadcast}
					onClick={() => setSelected({ kind: "broadcast" })}
				/>
				{allianceId && (
					<ChannelEntry
						label={`Alliance · ${diplomacy.myAlliance?.tag ?? ""}`}
						iconNode={<Users className="size-3.5" />}
						active={selected.kind === "alliance"}
						unread={unreadCounts.alliance}
						onClick={() => setSelected({ kind: "alliance", allianceId })}
					/>
				)}
				<div className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
					Direct messages
				</div>
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					{dmContacts.length === 0 && (
						<span className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
							No other players yet.
						</span>
					)}
					{dmContacts.map((p) => {
						const iso2 = ALPHA3_TO_ALPHA2[p.countryCode] ?? null;
						const isActive = selected.kind === "dm" && selected.peerId === p.id;
						const unread = unreadCounts.dms[p.id] ?? 0;
						return (
							<ChannelEntry
								key={p.id}
								label={p.displayName}
								sub={p.countryCode}
								iconNode={
									iso2 ? (
										<Image
											src={`https://flagcdn.com/w40/${iso2}.png`}
											alt=""
											width={16}
											height={11}
											unoptimized
											className="h-3 w-4 flex-shrink-0 border border-border object-cover"
										/>
									) : (
										<span className="h-3 w-4 flex-shrink-0 border border-border bg-muted" />
									)
								}
								active={isActive}
								unread={unread}
								onClick={() => setSelected({ kind: "dm", peerId: p.id })}
							/>
						);
					})}
				</div>
			</aside>

			{/* Conversation view */}
			<div className="flex min-h-0 flex-1 flex-col">
				<header className="flex items-center justify-between border-b border-border px-3 py-2">
					<span className="font-mono text-xs uppercase tracking-[0.18em] text-foreground">
						{selected.kind === "broadcast"
							? "Global broadcast"
							: selected.kind === "alliance"
								? `Alliance chat · ${diplomacy.myAlliance?.name ?? ""}`
								: `DM · ${playerById.get(selected.peerId)?.displayName ?? selected.peerId.slice(0, 8)}`}
					</span>
					{selected.kind === "broadcast" && (
						<Badge variant="warn" size="sm">
							5/hour limit
						</Badge>
					)}
				</header>

				<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
					{conversation.length === 0 && (
						<div className="flex flex-1 items-center justify-center font-mono text-[11px] text-muted-foreground">
							No messages yet.
						</div>
					)}
					{conversation.map((m) => {
						const sender = playerById.get(m.senderId);
						const isMe = m.senderId === myId;
						return (
							<div
								key={m.id}
								className={`flex max-w-[80%] flex-col gap-0.5 ${isMe ? "self-end items-end" : "self-start items-start"}`}
							>
								<div className="flex items-baseline gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
									<span className="text-foreground">
										{sender?.displayName ?? m.senderId.slice(0, 8)}
									</span>
									<span>· {sender?.countryCode ?? "—"}</span>
									<span>· tick {m.sentAtTick}</span>
								</div>
								<div
									className={`whitespace-pre-wrap break-words border px-2 py-1 font-mono text-[12px] ${
										isMe
											? "border-primary/40 bg-primary/10 text-foreground"
											: "border-border bg-card text-foreground"
									}`}
								>
									{m.body}
								</div>
							</div>
						);
					})}
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						send.mutate();
					}}
					className="flex flex-col gap-1 border-t border-border bg-card/40 px-3 py-2"
				>
					<textarea
						value={body}
						onChange={(e) => setBody(e.target.value.slice(0, 2000))}
						maxLength={2000}
						rows={2}
						placeholder="Plain text, max 2000 chars. No edits, no deletes."
						className="resize-none border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								if (body.trim()) send.mutate();
							}
						}}
					/>
					<div className="flex items-center justify-between">
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
							{body.length}/2000 · ⏎ to send · ⇧⏎ for newline
						</span>
						<Button
							type="submit"
							size="xs"
							variant="primary"
							disabled={send.isPending || !body.trim()}
						>
							<Send />
							{send.isPending ? "Sending…" : "Send"}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}

function ChannelEntry({
	label,
	sub,
	iconNode,
	active,
	unread,
	onClick,
}: {
	label: string;
	sub?: string;
	iconNode: React.ReactNode;
	active: boolean;
	unread: number;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex w-full items-center gap-2 border-b border-border px-2 py-1.5 text-left transition-colors ${
				active ? "bg-accent" : "hover:bg-accent/50"
			}`}
		>
			<span className="flex flex-shrink-0 items-center">{iconNode}</span>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-mono text-[11px] text-foreground">{label}</span>
				{sub && (
					<span className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
						{sub}
					</span>
				)}
			</div>
			{unread > 0 && (
				<Badge variant="warn" size="sm">
					{unread}
				</Badge>
			)}
		</button>
	);
}

/**
 * Per-channel unread counts — number of messages newer than the player's
 * last_seen_message_id. The server returns the read row keyed by
 * `(playerId, channel, peerKey)`; we walk each thread and count messages
 * with id > lastSeen.
 *
 * Since UUIDs aren't comparable, we use sentAtTick + the message id as
 * tiebreaker; for the snapshot's ordering this is sufficient.
 */
function computeUnreadCounts(
	diplomacy: DiplomacySnapshot,
	myId: string,
): { broadcast: number; alliance: number; dms: Record<string, number> } {
	const dmsByPeer = new Map<string, DiplomacyMessage[]>();
	for (const m of diplomacy.messages.dms) {
		const peer = m.senderId === myId ? m.recipientPlayerId : m.senderId;
		if (!peer) continue;
		const arr = dmsByPeer.get(peer) ?? [];
		arr.push(m);
		dmsByPeer.set(peer, arr);
	}

	const dms: Record<string, number> = {};
	for (const [peer, msgs] of dmsByPeer) {
		const peerKey = `p:${peer}`;
		const lastSeen = diplomacy.messages.reads.find(
			(r) => r.channel === "dm" && r.peerKey === peerKey,
		)?.lastSeenMessageId;
		dms[peer] = countNewer(msgs, lastSeen, myId);
	}

	const allianceKey = diplomacy.myAlliance ? `a:${diplomacy.myAlliance.id}` : null;
	const allianceLastSeen = allianceKey
		? diplomacy.messages.reads.find((r) => r.channel === "alliance" && r.peerKey === allianceKey)
				?.lastSeenMessageId
		: undefined;

	const broadcastLastSeen = diplomacy.messages.reads.find(
		(r) => r.channel === "broadcast" && r.peerKey === "g",
	)?.lastSeenMessageId;

	return {
		broadcast: countNewer(diplomacy.messages.broadcast, broadcastLastSeen, myId),
		alliance: allianceKey ? countNewer(diplomacy.messages.alliance, allianceLastSeen, myId) : 0,
		dms,
	};
}

function countNewer(
	msgs: DiplomacyMessage[],
	lastSeenId: string | undefined,
	excludeSenderId: string,
): number {
	if (!lastSeenId) {
		return msgs.filter((m) => m.senderId !== excludeSenderId).length;
	}
	const sortedAsc = [...msgs].sort((a, b) => a.sentAtTick - b.sentAtTick);
	const idx = sortedAsc.findIndex((m) => m.id === lastSeenId);
	if (idx === -1) {
		return sortedAsc.filter((m) => m.senderId !== excludeSenderId).length;
	}
	return sortedAsc.slice(idx + 1).filter((m) => m.senderId !== excludeSenderId).length;
}
