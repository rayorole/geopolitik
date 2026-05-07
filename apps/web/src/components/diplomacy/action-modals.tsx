"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gamesApi, queryKeys } from "@/lib/api-client";
import { ALPHA3_TO_ALPHA2 } from "@/lib/country-flags";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

/*
 * Per-nation action modals — Phase 6b/6d.
 *
 * Treaty + war modals submit real orders against /games/:id/orders
 * once a target playerId is known (i.e. the nation is currently held
 * by a player). Trade + message modals lock in 6f / 6e respectively.
 */

export interface ActionModalTarget {
	code: string;
	name: string;
	leaderName: string;
	/** Only present when the nation is currently player-held. */
	playerId: string | null;
}

const TREATY_TYPES = [
	{ id: "non_aggression", label: "Non-aggression pact" },
	{ id: "defensive_pact", label: "Defensive pact" },
	{ id: "trade_route", label: "Trade route (Phase 8 stub)" },
	{ id: "military_access", label: "Military access" },
	{ id: "coalition_war", label: "Coalition war" },
] as const;

function ModalHeader({ target, eyebrow }: { target: ActionModalTarget; eyebrow: string }) {
	const iso2 = ALPHA3_TO_ALPHA2[target.code] ?? null;
	return (
		<DialogHeader>
			<div className="flex items-center gap-2">
				{iso2 ? (
					<Image
						src={`https://flagcdn.com/w40/${iso2}.png`}
						alt=""
						width={24}
						height={16}
						unoptimized
						className="h-4 w-6 flex-shrink-0 border border-border object-cover"
					/>
				) : null}
				<DialogTitle>{eyebrow}</DialogTitle>
			</div>
			<DialogDescription>
				{target.name} · {target.code} · {target.leaderName}
			</DialogDescription>
		</DialogHeader>
	);
}

function comingSoon(phase: string) {
	toast.info(`Coming in Phase ${phase}`, {
		description: "Order plumbing lands in the corresponding slice. The form is just a stub.",
	});
}

// ── Propose treaty (6d) ─────────────────────────────────────────────────────

export function ProposeTreatyModal({
	gameId,
	open,
	target,
	onClose,
}: {
	gameId: string;
	open: boolean;
	target: ActionModalTarget | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [type, setType] = useState<(typeof TREATY_TYPES)[number]["id"]>("non_aggression");
	const [note, setNote] = useState("");

	const submit = useMutation({
		mutationFn: () => {
			if (!target?.playerId) throw new Error("Treaty target must be a player");
			return gamesApi.submitOrder(gameId, {
				kind: "propose_treaty",
				payload: {
					targetId: target.playerId,
					type,
					...(note.trim() ? { note: note.trim() } : {}),
				},
			});
		},
		onSuccess: () => {
			toast.success(`Treaty proposed to ${target?.name}`);
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
			setNote("");
			setType("non_aggression");
			onClose();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Treaty rejected"),
	});

	if (!target) return null;

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		submit.mutate();
	};

	const canSubmit = !!target.playerId && !submit.isPending;

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<ModalHeader target={target} eyebrow="Propose Treaty" />
				<form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
					{!target.playerId && (
						<p className="font-mono text-[11px] text-[var(--color-warn)]">
							Treaty target must be a player-held nation. {target.name} is currently unclaimed.
						</p>
					)}
					<div className="flex flex-col gap-1.5">
						<Label
							htmlFor="treaty-type"
							className="font-mono text-[10px] uppercase tracking-[0.18em]"
						>
							Treaty type
						</Label>
						<select
							id="treaty-type"
							value={type}
							onChange={(e) => setType(e.target.value as typeof type)}
							className="border border-border bg-card px-2 py-1.5 font-mono text-xs text-foreground"
						>
							{TREATY_TYPES.map((t) => (
								<option key={t.id} value={t.id}>
									{t.label}
								</option>
							))}
						</select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label
							htmlFor="treaty-note"
							className="font-mono text-[10px] uppercase tracking-[0.18em]"
						>
							Note (optional, 280 chars)
						</Label>
						<textarea
							id="treaty-note"
							value={note}
							onChange={(e) => setNote(e.target.value.slice(0, 280))}
							maxLength={280}
							rows={3}
							className="resize-none border border-border bg-card px-2 py-1.5 font-mono text-xs text-foreground"
						/>
						<span className="self-end font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
							{note.length}/280
						</span>
					</div>
					<DialogFooter className="-mx-4 -mb-4 mt-1 px-4 py-3">
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
							{submit.isPending ? "Proposing…" : "Propose"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Propose trade (6f stub) ─────────────────────────────────────────────────

interface Bundle {
	money: number;
	oil: number;
	steel: number;
	electronics: number;
}
const ZERO: Bundle = { money: 0, oil: 0, steel: 0, electronics: 0 };

function BundleEditor({
	label,
	bundle,
	onChange,
}: {
	label: string;
	bundle: Bundle;
	onChange: (b: Bundle) => void;
}) {
	const fields: (keyof Bundle)[] = ["money", "oil", "steel", "electronics"];
	return (
		<div className="flex flex-col gap-1.5">
			<Label className="font-mono text-[10px] uppercase tracking-[0.18em]">{label}</Label>
			<div className="grid grid-cols-2 gap-2">
				{fields.map((f) => (
					<div key={f} className="flex items-center gap-1.5">
						<span className="w-20 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							{f}
						</span>
						<Input
							type="number"
							min={0}
							value={bundle[f]}
							onChange={(e) => onChange({ ...bundle, [f]: Number(e.target.value) })}
							className="h-7 font-mono text-xs"
						/>
					</div>
				))}
			</div>
		</div>
	);
}

export function ProposeTradeModal({
	gameId,
	open,
	target,
	onClose,
}: {
	gameId: string;
	open: boolean;
	target: ActionModalTarget | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [give, setGive] = useState<Bundle>(ZERO);
	const [receive, setReceive] = useState<Bundle>(ZERO);
	const [note, setNote] = useState("");

	const submit = useMutation({
		mutationFn: () => {
			if (!target?.playerId) throw new Error("Trade target must be a player");
			return gamesApi.submitOrder(gameId, {
				kind: "propose_trade",
				payload: {
					targetId: target.playerId,
					give,
					receive,
					...(note.trim() ? { note: note.trim() } : {}),
				},
			});
		},
		onSuccess: () => {
			toast.success(`Trade proposed to ${target?.name}`);
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
			setGive(ZERO);
			setReceive(ZERO);
			setNote("");
			onClose();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Trade rejected"),
	});

	if (!target) return null;

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		submit.mutate();
	};

	const giveSum = give.money + give.oil + give.steel + give.electronics;
	const receiveSum = receive.money + receive.oil + receive.steel + receive.electronics;
	const canSubmit = !!target.playerId && (giveSum > 0 || receiveSum > 0) && !submit.isPending;

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-xl">
				<ModalHeader target={target} eyebrow="Propose Trade" />
				<form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
					{!target.playerId && (
						<p className="font-mono text-[11px] text-[var(--color-warn)]">
							Trade target must be a player-held nation.
						</p>
					)}
					<BundleEditor label="You give" bundle={give} onChange={setGive} />
					<BundleEditor label="You receive" bundle={receive} onChange={setReceive} />
					<div className="flex flex-col gap-1.5">
						<Label
							htmlFor="trade-note"
							className="font-mono text-[10px] uppercase tracking-[0.18em]"
						>
							Note (optional, 280 chars)
						</Label>
						<textarea
							id="trade-note"
							value={note}
							onChange={(e) => setNote(e.target.value.slice(0, 280))}
							maxLength={280}
							rows={2}
							className="resize-none border border-border bg-card px-2 py-1.5 font-mono text-xs text-foreground"
						/>
					</div>
					<DialogFooter className="-mx-4 -mb-4 mt-1 px-4 py-3">
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
							{submit.isPending ? "Proposing…" : "Propose trade"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Send message (6e stub) ──────────────────────────────────────────────────

export function SendMessageModal({
	gameId,
	open,
	target,
	onClose,
}: {
	gameId: string;
	open: boolean;
	target: ActionModalTarget | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [body, setBody] = useState("");

	const submit = useMutation({
		mutationFn: () => {
			if (!target?.playerId) throw new Error("Message target must be a player");
			return gamesApi.submitOrder(gameId, {
				kind: "send_message",
				payload: { channel: "dm", recipientPlayerId: target.playerId, body: body.trim() },
			});
		},
		onSuccess: () => {
			toast.success(`Message sent to ${target?.name}`);
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
			setBody("");
			onClose();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Send rejected"),
	});

	if (!target) return null;

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		submit.mutate();
	};

	const canSubmit = !!target.playerId && body.trim().length > 0 && !submit.isPending;

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<ModalHeader target={target} eyebrow="Send Message" />
				<form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
					{!target.playerId && (
						<p className="font-mono text-[11px] text-[var(--color-warn)]">
							Message target must be a player-held nation.
						</p>
					)}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="msg-body" className="font-mono text-[10px] uppercase tracking-[0.18em]">
							Message (max 2000 chars)
						</Label>
						<textarea
							id="msg-body"
							value={body}
							onChange={(e) => setBody(e.target.value.slice(0, 2000))}
							maxLength={2000}
							rows={6}
							className="resize-none border border-border bg-card px-2 py-1.5 font-mono text-xs text-foreground"
						/>
						<span className="self-end font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
							{body.length}/2000
						</span>
					</div>
					<DialogFooter className="-mx-4 -mb-4 mt-1 px-4 py-3">
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
							{submit.isPending ? "Sending…" : "Send"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Declare war (6d) ────────────────────────────────────────────────────────

export function DeclareWarModal({
	gameId,
	open,
	target,
	onClose,
}: {
	gameId: string;
	open: boolean;
	target: ActionModalTarget | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();

	const submit = useMutation({
		mutationFn: () => {
			if (!target?.playerId) throw new Error("War target must be a player");
			return gamesApi.submitOrder(gameId, {
				kind: "declare_war",
				payload: { targetId: target.playerId },
			});
		},
		onSuccess: () => {
			toast.error(`War declared on ${target?.name}`, { description: "Effect lands next tick." });
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
			onClose();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "War rejected by server"),
	});

	if (!target) return null;

	const canSubmit = !!target.playerId && !submit.isPending;

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<ModalHeader target={target} eyebrow="Declare War" />
				<div className="flex flex-col gap-3 p-4">
					{!target.playerId ? (
						<p className="font-mono text-[11px] text-[var(--color-warn)]">
							War target must be a player-held nation.
						</p>
					) : (
						<>
							<p className="font-mono text-xs leading-relaxed text-foreground">
								You are about to declare war on <strong>{target.name}</strong>. Effect is immediate
								next tick.
							</p>
							<p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
								The server rejects this if blocked by a non-aggression treaty, defensive pact,
								alliance co-membership, or a post-leave cooling pact. Defensive pacts the target
								holds will auto-trigger — pact partners enter the war on the same tick.
							</p>
						</>
					)}
					<DialogFooter className="-mx-4 -mb-4 mt-1 px-4 py-3">
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							onClick={() => submit.mutate()}
							disabled={!canSubmit}
						>
							{submit.isPending ? "Declaring…" : "Declare war"}
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
// Reference to keep comingSoon import alive in case future stubs need it.
void comingSoon;
