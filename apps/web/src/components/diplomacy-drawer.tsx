"use client";

import { AlliancesTab } from "@/components/diplomacy/alliances-tab";
import { NationsTab } from "@/components/diplomacy/nations-tab";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { gamesApi, queryKeys, worldApi } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";
import { Handshake } from "lucide-react";
import { useState } from "react";

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
	mePlayerId: _mePlayerId,
	pendingProposalCount = 0,
	unreadMessageCount = 0,
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
	const diplomacy = useQuery({
		queryKey: queryKeys.gameDiplomacy(gameId),
		queryFn: () => gamesApi.diplomacy(gameId),
		enabled: open,
	});

	const showProposalDot = pendingProposalCount > 0;
	const showUnreadDot = unreadMessageCount > 0;

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button variant="ghost" size="sm" className="relative h-7 px-2">
					<Handshake className="size-3.5" />
					<span className="font-mono text-[10px] uppercase tracking-[0.18em]">Diplomacy</span>
					{showProposalDot && (
						<span
							aria-label={`${pendingProposalCount} pending proposals`}
							className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive"
						/>
					)}
					{showUnreadDot && !showProposalDot && (
						<span
							aria-label={`${unreadMessageCount} unread messages`}
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
					{tab === "nations" && <NationsTab snapshot={snapshot.data} world={world.data} />}
					{tab === "alliances" && (
						<AlliancesTab
							gameId={gameId}
							snapshot={diplomacy.data}
							gameSnapshot={snapshot.data}
							currentTick={snapshot.data?.game.tick ?? 0}
						/>
					)}
					{tab === "messages" && <MessagesTabPlaceholder />}
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

function MessagesTabPlaceholder() {
	return (
		<EmptyTab
			title="Messages — coming in Phase 6e"
			body="Discord-style messaging: 1:1 nation DMs, alliance group chat, and a global broadcast channel. 2000-char max, 30 msg/min, 5 broadcasts/hour."
		/>
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
