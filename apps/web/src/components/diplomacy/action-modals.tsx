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
import { ALPHA3_TO_ALPHA2 } from "@/lib/country-flags";
import Image from "next/image";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

/*
 * Per-nation action modals — Phase 6b.
 *
 * Scaffold the four diplomacy actions exposed from the Nations tab.
 * Each modal renders a real form with the inputs the eventual order
 * payload will need, but Submit fires a "coming in Phase 6X" toast and
 * closes — the actual order plumbing lands in 6c (alliances), 6d
 * (treaties + war), 6e (messages), 6f (trades).
 */

export interface ActionModalTarget {
	code: string;
	name: string;
	leaderName: string;
}

const TREATY_TYPES = [
	{ id: "non_aggression", label: "Non-aggression pact", phase: "6d" },
	{ id: "defensive_pact", label: "Defensive pact", phase: "6d" },
	{ id: "trade_route", label: "Trade route (Phase 8 stub)", phase: "6d" },
	{ id: "military_access", label: "Military access", phase: "6d" },
	{ id: "coalition_war", label: "Coalition war", phase: "6d" },
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

// ── Propose treaty ──────────────────────────────────────────────────────────

export function ProposeTreatyModal({
	open,
	target,
	onClose,
}: {
	open: boolean;
	target: ActionModalTarget | null;
	onClose: () => void;
}) {
	const [type, setType] = useState<(typeof TREATY_TYPES)[number]["id"]>("non_aggression");
	const [note, setNote] = useState("");

	if (!target) return null;

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		comingSoon("6d");
		setNote("");
		setType("non_aggression");
		onClose();
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<ModalHeader target={target} eyebrow="Propose Treaty" />
				<form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
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
						<Button type="submit" variant="primary" size="sm">
							Propose
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Propose trade ───────────────────────────────────────────────────────────

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
	open,
	target,
	onClose,
}: {
	open: boolean;
	target: ActionModalTarget | null;
	onClose: () => void;
}) {
	const [give, setGive] = useState<Bundle>(ZERO);
	const [receive, setReceive] = useState<Bundle>(ZERO);
	const [note, setNote] = useState("");

	if (!target) return null;

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		comingSoon("6f");
		setGive(ZERO);
		setReceive(ZERO);
		setNote("");
		onClose();
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-xl">
				<ModalHeader target={target} eyebrow="Propose Trade" />
				<form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
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
						<Button type="submit" variant="primary" size="sm">
							Propose trade
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Send message ────────────────────────────────────────────────────────────

export function SendMessageModal({
	open,
	target,
	onClose,
}: {
	open: boolean;
	target: ActionModalTarget | null;
	onClose: () => void;
}) {
	const [body, setBody] = useState("");

	if (!target) return null;

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		comingSoon("6e");
		setBody("");
		onClose();
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<ModalHeader target={target} eyebrow="Send Message" />
				<form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
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
						<Button type="submit" variant="primary" size="sm" disabled={!body.trim()}>
							Send
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Declare war ─────────────────────────────────────────────────────────────

export function DeclareWarModal({
	open,
	target,
	onClose,
}: {
	open: boolean;
	target: ActionModalTarget | null;
	onClose: () => void;
}) {
	if (!target) return null;

	const onConfirm = () => {
		comingSoon("6d");
		onClose();
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<ModalHeader target={target} eyebrow="Declare War" />
				<div className="flex flex-col gap-3 p-4">
					<p className="font-mono text-xs leading-relaxed text-foreground">
						You are about to declare war on <strong>{target.name}</strong>. War declarations take
						effect immediately on the next tick.
					</p>
					<p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
						Phase 6d will reject war if blocked by a non-aggression treaty, defensive pact, alliance
						co-membership, or post-leave cooling period. Defensive pacts the target holds will
						auto-trigger — pact partners enter the war on the same tick.
					</p>
					<DialogFooter className="-mx-4 -mb-4 mt-1 px-4 py-3">
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							Cancel
						</Button>
						<Button type="button" variant="destructive" size="sm" onClick={onConfirm}>
							Declare war
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
