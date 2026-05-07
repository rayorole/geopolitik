"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ALPHA3_TO_ALPHA2 } from "@/lib/country-flags";
import { resolveLeaderName } from "@/lib/leader-name";
import type { GameSnapshot, PlayerInGame, WorldDataset } from "@geopolitik/shared/api";
import { Handshake, MessageSquare, Repeat, Swords } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import {
	DeclareWarModal,
	ProposeTradeModal,
	ProposeTreatyModal,
	SendMessageModal,
} from "./action-modals";

/*
 * Nations tab — Phase 6b.
 *
 * Renders all world nations split into Active Powers (player-held) and
 * Sleeper Nations (no player). Each card carries flag, leader name,
 * city count, status badge, and four action buttons.
 *
 * Computer-controlled nations are a Phase 8 concept; until then every
 * non-player country is "Open". We expose a Computer filter row for
 * future-compat but no rows ever fall into it in 6b.
 *
 * Per-nation actions all open scaffolded modals whose Submit buttons
 * fire a "coming in Phase 6X" toast — slices 6c–6f wire actual orders.
 */

type StatusFilter = "all" | "taken" | "open" | "computer";
type CardStatus = "taken" | "open" | "computer";

interface NationCardData {
	code: string;
	name: string;
	cityCount: number;
	status: CardStatus;
	leaderName: string;
	owner: PlayerInGame | null;
}

export function NationsTab({
	snapshot,
	world,
}: {
	snapshot: GameSnapshot | undefined;
	world: WorldDataset | undefined;
}) {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<StatusFilter>("all");
	const [openModal, setOpenModal] = useState<{
		kind: "treaty" | "trade" | "message" | "war";
		target: NationCardData;
	} | null>(null);

	const cards = useMemo<NationCardData[]>(() => {
		if (!world) return [];
		const cityCountByCountry = new Map<string, number>();
		for (const c of world.cities) {
			cityCountByCountry.set(c.countryCode, (cityCountByCountry.get(c.countryCode) ?? 0) + 1);
		}
		const playerByCountry = new Map<string, PlayerInGame>();
		if (snapshot) {
			for (const p of snapshot.players) {
				playerByCountry.set(p.countryCode, p);
			}
		}
		return world.countries
			.filter((c) => c.isPlayable)
			.map((c) => {
				const owner = playerByCountry.get(c.code) ?? null;
				const status: CardStatus = owner ? "taken" : "open";
				return {
					code: c.code,
					name: c.name,
					cityCount: cityCountByCountry.get(c.code) ?? 0,
					status,
					leaderName: resolveLeaderName({
						countryCode: c.code,
						countryName: c.name,
						ownerDisplayName: owner?.displayName,
					}),
					owner,
				};
			});
	}, [world, snapshot]);

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase();
		return cards.filter((c) => {
			if (filter !== "all" && c.status !== filter) return false;
			if (!q) return true;
			return (
				c.name.toLowerCase().includes(q) ||
				c.code.toLowerCase().includes(q) ||
				c.leaderName.toLowerCase().includes(q)
			);
		});
	}, [cards, search, filter]);

	const active = visible.filter((c) => c.status === "taken");
	const sleeper = visible.filter((c) => c.status !== "taken");

	const myPlayerId = snapshot?.mePlayerId ?? null;

	return (
		<>
			<div className="flex flex-col gap-3 px-3 py-3">
				<FilterStrip
					search={search}
					onSearch={setSearch}
					filter={filter}
					onFilter={setFilter}
					counts={{
						all: cards.length,
						taken: cards.filter((c) => c.status === "taken").length,
						open: cards.filter((c) => c.status === "open").length,
						computer: cards.filter((c) => c.status === "computer").length,
					}}
				/>

				{active.length > 0 && (
					<NationSection
						title="Active Powers"
						subtitle={`${active.length} player-held`}
						accent="signal"
					>
						{active.map((card) => (
							<NationCard
								key={card.code}
								card={card}
								isMe={!!card.owner && card.owner.id === myPlayerId}
								onAction={(kind) => setOpenModal({ kind, target: card })}
							/>
						))}
					</NationSection>
				)}

				{sleeper.length > 0 && (
					<NationSection
						title="Sleeper Nations"
						subtitle={`${sleeper.length} unclaimed`}
						accent="muted"
					>
						{sleeper.map((card) => (
							<NationCard
								key={card.code}
								card={card}
								isMe={false}
								onAction={(kind) => setOpenModal({ kind, target: card })}
							/>
						))}
					</NationSection>
				)}

				{visible.length === 0 && (
					<div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
						<span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
							No nations match
						</span>
						<span className="font-mono text-[11px] text-muted-foreground/70">
							Try a different search term or filter.
						</span>
					</div>
				)}
			</div>

			<ProposeTreatyModal
				open={openModal?.kind === "treaty"}
				target={openModal?.target ?? null}
				onClose={() => setOpenModal(null)}
			/>
			<ProposeTradeModal
				open={openModal?.kind === "trade"}
				target={openModal?.target ?? null}
				onClose={() => setOpenModal(null)}
			/>
			<SendMessageModal
				open={openModal?.kind === "message"}
				target={openModal?.target ?? null}
				onClose={() => setOpenModal(null)}
			/>
			<DeclareWarModal
				open={openModal?.kind === "war"}
				target={openModal?.target ?? null}
				onClose={() => setOpenModal(null)}
			/>
		</>
	);
}

function FilterStrip({
	search,
	onSearch,
	filter,
	onFilter,
	counts,
}: {
	search: string;
	onSearch: (v: string) => void;
	filter: StatusFilter;
	onFilter: (v: StatusFilter) => void;
	counts: Record<StatusFilter, number>;
}) {
	const filterOptions: { id: StatusFilter; label: string }[] = [
		{ id: "all", label: "All" },
		{ id: "taken", label: "Taken" },
		{ id: "open", label: "Open" },
		{ id: "computer", label: "Computer" },
	];
	return (
		<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
			<Input
				value={search}
				onChange={(e) => onSearch(e.target.value)}
				placeholder="Search by nation, code, or leader…"
				className="max-w-sm font-mono text-xs"
			/>
			<div className="flex flex-wrap gap-1">
				{filterOptions.map((opt) => (
					<button
						type="button"
						key={opt.id}
						onClick={() => onFilter(opt.id)}
						className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
							filter === opt.id
								? "border-primary bg-primary/10 text-primary"
								: "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground"
						}`}
					>
						{opt.label}
						<span className="ml-1.5 text-muted-foreground/60 tabular-nums">{counts[opt.id]}</span>
					</button>
				))}
			</div>
		</div>
	);
}

function NationSection({
	title,
	subtitle,
	accent,
	children,
}: {
	title: string;
	subtitle: string;
	accent: "signal" | "muted";
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between border-b border-border pb-1.5">
				<span
					className={`font-mono text-[11px] uppercase tracking-[0.18em] ${
						accent === "signal" ? "text-primary" : "text-muted-foreground"
					}`}
				>
					{title}
				</span>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					{subtitle}
				</span>
			</div>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
		</section>
	);
}

function NationCard({
	card,
	isMe,
	onAction,
}: {
	card: NationCardData;
	isMe: boolean;
	onAction: (kind: "treaty" | "trade" | "message" | "war") => void;
}) {
	const iso2 = ALPHA3_TO_ALPHA2[card.code] ?? null;
	return (
		<article
			className={`flex flex-col gap-2 border bg-card p-3 ${
				isMe ? "border-primary" : "border-border"
			}`}
		>
			<div className="flex items-start gap-2">
				{iso2 ? (
					<Image
						src={`https://flagcdn.com/w40/${iso2}.png`}
						alt=""
						width={24}
						height={16}
						unoptimized
						className="h-4 w-6 flex-shrink-0 self-center border border-border object-cover"
					/>
				) : (
					<div className="h-4 w-6 flex-shrink-0 self-center border border-border bg-muted" />
				)}
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-sm leading-tight text-foreground">{card.name}</span>
					<span className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
						{card.code} · {card.cityCount} cit{card.cityCount === 1 ? "y" : "ies"}
					</span>
				</div>
				<StatusBadge status={card.status} isMe={isMe} />
			</div>

			<div className="font-mono text-[11px] leading-tight text-foreground/90">
				{card.leaderName}
			</div>

			<div className="grid grid-cols-2 gap-1 pt-1">
				<Button
					size="xs"
					variant="ghost"
					onClick={() => onAction("treaty")}
					disabled={isMe}
					className="justify-start"
					title={isMe ? "Cannot send treaty to your own nation" : undefined}
				>
					<Handshake />
					Treaty
				</Button>
				<Button
					size="xs"
					variant="ghost"
					onClick={() => onAction("trade")}
					disabled={isMe || card.status !== "taken"}
					className="justify-start"
					title={
						isMe
							? "Cannot trade with your own nation"
							: card.status !== "taken"
								? "Trade target must be a player"
								: undefined
					}
				>
					<Repeat />
					Trade
				</Button>
				<Button
					size="xs"
					variant="ghost"
					onClick={() => onAction("message")}
					disabled={isMe || card.status !== "taken"}
					className="justify-start"
					title={
						isMe
							? "Cannot message your own nation"
							: card.status !== "taken"
								? "Message target must be a player"
								: undefined
					}
				>
					<MessageSquare />
					Message
				</Button>
				<Button
					size="xs"
					variant="destructive"
					onClick={() => onAction("war")}
					disabled={isMe}
					className="justify-start"
					title={isMe ? "Cannot declare war on your own nation" : undefined}
				>
					<Swords />
					War
				</Button>
			</div>
		</article>
	);
}

function StatusBadge({ status, isMe }: { status: CardStatus; isMe: boolean }) {
	if (isMe) {
		return (
			<Badge variant="signal" size="sm">
				You
			</Badge>
		);
	}
	if (status === "taken") {
		return (
			<Badge variant="solid" size="sm">
				Taken
			</Badge>
		);
	}
	if (status === "computer") {
		return (
			<Badge variant="info" size="sm">
				Computer
			</Badge>
		);
	}
	return (
		<Badge variant="default" size="sm">
			Open
		</Badge>
	);
}
