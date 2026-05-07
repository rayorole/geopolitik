"use client";

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
import type { GameSnapshot, ResearchProjectRow, ResearchUnlockRow } from "@geopolitik/shared/api";
import { getBuildingDef } from "@geopolitik/shared/buildings";
import type { FactionId } from "@geopolitik/shared/factions";
import type { ResearchNode, ResearchTreeFile, TreeId } from "@geopolitik/shared/research";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, X } from "lucide-react";
import { useMemo, useState } from "react";

/*
 * Research drawer — Phase 4c.
 *
 * Bottom drawer that slides up fullscreen over the map. 4c wires the order
 * end-to-end: clickable nodes, validated "Research" button, active project
 * strip with progress / ETA / cancel. Map stays mounted underneath so
 * dismiss returns to game state without a route change.
 *
 * Validation runs both client-side (for live tooltip feedback) and on the
 * server (the source of truth). Mismatches fall through to a server reject
 * shown as toast — but the affordability + slot/prereq math here matches
 * applyStartResearch in research-orders.ts to keep the UX honest.
 */

const TREE_LABELS: Record<TreeId, string> = {
	ground: "Ground",
	mechanized: "Mechanized",
	helicopters: "Helicopters",
	air: "Air",
	naval: "Naval",
	deep_water: "Deep Water",
	space: "Space",
};

const TREE_ORDER: TreeId[] = [
	"ground",
	"mechanized",
	"helicopters",
	"air",
	"naval",
	"deep_water",
	"space",
];

const RES_DIVISOR = 100;

function fmtRes(n: number | undefined): string {
	if (!n) return "0";
	return (n / RES_DIVISOR).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtTicks(n: number): string {
	const seconds = n * 30;
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const remMinutes = minutes % 60;
	return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

type NodeStatus = "unlocked" | "in_progress" | "locked";

function statusForNode(
	node: ResearchNode,
	unlocks: ResearchUnlockRow[],
	active: ResearchProjectRow[],
): NodeStatus {
	if (unlocks.some((u) => u.nodeId === node.id)) return "unlocked";
	if (active.some((p) => p.nodeId === node.id)) return "in_progress";
	return "locked";
}

type Pool = { money: number; oil: number; steel: number; electronics: number };

function computeLabDiscountPct(labCount: number): number {
	const eff = getBuildingDef("research_lab")?.effects;
	if (!eff?.researchCostDiscountPct || !eff?.stackCap) return 0;
	return Math.min(Math.max(labCount, 0), eff.stackCap) * eff.researchCostDiscountPct;
}

function applyDiscount(cost: ResearchNode["cost"], discountPct: number): Pool {
	const factor = Math.max(0, 100 - discountPct);
	return {
		money: Math.floor(((cost.money ?? 0) * factor) / 100),
		oil: Math.floor(((cost.oil ?? 0) * factor) / 100),
		steel: Math.floor(((cost.steel ?? 0) * factor) / 100),
		electronics: Math.floor(((cost.electronics ?? 0) * factor) / 100),
	};
}

type StartReason =
	| "ok"
	| "tier_zero"
	| "already_unlocked"
	| "already_in_progress"
	| "missing_prereqs"
	| "slots_full"
	| "insufficient_resources";

function reasonLabel(r: StartReason): string {
	switch (r) {
		case "ok":
			return "Research";
		case "tier_zero":
			return "Tier 0 starter — already unlocked";
		case "already_unlocked":
			return "Already unlocked";
		case "already_in_progress":
			return "Already researching";
		case "missing_prereqs":
			return "Missing prerequisites";
		case "slots_full":
			return "All research slots in use";
		case "insufficient_resources":
			return "Insufficient resources";
	}
}

function computeStartReason(
	node: ResearchNode,
	unlocks: ResearchUnlockRow[],
	active: ResearchProjectRow[],
	pool: Pool | null,
	costPostDiscount: Pool,
	slotMax: number,
): StartReason {
	if (node.tier === 0) return "tier_zero";
	if (unlocks.some((u) => u.nodeId === node.id)) return "already_unlocked";
	if (active.some((p) => p.nodeId === node.id)) return "already_in_progress";
	const have = new Set(unlocks.map((u) => u.nodeId));
	for (const p of node.prereqs) {
		if (!have.has(p)) return "missing_prereqs";
	}
	if (active.length >= slotMax) return "slots_full";
	if (!pool) return "insufficient_resources";
	if (
		costPostDiscount.money > pool.money ||
		costPostDiscount.oil > pool.oil ||
		costPostDiscount.steel > pool.steel ||
		costPostDiscount.electronics > pool.electronics
	) {
		return "insufficient_resources";
	}
	return "ok";
}

export function ResearchDrawer({
	gameId,
	mePlayerId,
}: {
	gameId: string;
	mePlayerId: string | null;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [selectedTree, setSelectedTree] = useState<TreeId>("ground");
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [serverError, setServerError] = useState<string | null>(null);

	const research = useQuery({
		queryKey: queryKeys.gameResearch(gameId),
		queryFn: () => gamesApi.research(gameId),
		enabled: open && !!mePlayerId,
	});

	const snapshot = queryClient.getQueryData<GameSnapshot>(queryKeys.gameSnapshot(gameId));

	const faction: FactionId | undefined = research.data?.faction;

	const trees = useQuery({
		queryKey: faction ? queryKeys.worldResearchTrees(faction) : ["world", "research", "none"],
		queryFn: () => {
			if (!faction) throw new Error("faction missing");
			return worldApi.researchTrees(faction);
		},
		enabled: open && !!faction,
		staleTime: 60 * 60 * 1000,
	});

	const treeByTree = useMemo(() => {
		const m = new Map<TreeId, ResearchTreeFile>();
		for (const t of trees.data?.trees ?? []) m.set(t.tree, t);
		return m;
	}, [trees.data]);

	const activeTree = treeByTree.get(selectedTree);

	const selectedNode: ResearchNode | undefined = useMemo(() => {
		if (!activeTree || !selectedNodeId) return undefined;
		return activeTree.nodes.find((n) => n.id === selectedNodeId);
	}, [activeTree, selectedNodeId]);

	const myNation = useMemo(
		() => snapshot?.nationState.find((n) => n.playerId === mePlayerId) ?? null,
		[snapshot, mePlayerId],
	);

	const pool: Pool | null = myNation
		? {
				money: myNation.money,
				oil: myNation.oil,
				steel: myNation.steel,
				electronics: myNation.electronics,
			}
		: null;

	const labCount = useMemo(() => {
		if (!snapshot || !mePlayerId) return 0;
		return snapshot.cityBuildings.filter(
			(b) =>
				b.type === "research_lab" && b.state === "complete" && b.builtByPlayerId === mePlayerId,
		).length;
	}, [snapshot, mePlayerId]);

	const discountPct = computeLabDiscountPct(labCount);

	// Phase 9 monetization aside: research_slot_max can grow past 2 via Command
	// Pass. We don't have it on the GameSnapshot yet (it's not in the snapshot
	// query selection). For now we read 2 as the default; if the column is
	// non-default we'll route it through the snapshot in a follow-up.
	const researchSlotMax = 2;

	const startMutation = useMutation({
		mutationFn: (nodeId: string) =>
			gamesApi.submitOrder(gameId, { kind: "start_research", payload: { nodeId } }),
		onSuccess: () => {
			setServerError(null);
			queryClient.invalidateQueries({ queryKey: queryKeys.gameResearch(gameId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
		},
		onError: (err) => {
			setServerError(err instanceof Error ? err.message : "Order rejected");
		},
	});

	const cancelMutation = useMutation({
		mutationFn: (projectId: string) =>
			gamesApi.submitOrder(gameId, { kind: "cancel_research", payload: { projectId } }),
		onSuccess: () => {
			setServerError(null);
			queryClient.invalidateQueries({ queryKey: queryKeys.gameResearch(gameId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
		},
		onError: (err) => {
			setServerError(err instanceof Error ? err.message : "Cancel rejected");
		},
	});

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button variant="ghost" size="sm" className="h-7 px-2">
					<FlaskConical className="size-3.5" />
					<span className="font-mono text-[10px] uppercase tracking-[0.18em]">Research</span>
				</Button>
			</SheetTrigger>
			<SheetContent
				side="bottom"
				className="flex h-[100vh] flex-col gap-0 border-t-2 border-border bg-background p-0"
			>
				<SheetHeader className="flex flex-row items-baseline justify-between border-b border-border p-3">
					<div className="flex flex-col gap-0.5">
						<SheetTitle className="font-mono text-sm uppercase tracking-[0.18em]">
							Research Command
						</SheetTitle>
						<SheetDescription className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							{faction ? `Faction: ${faction.replace("_", " ").toUpperCase()}` : "Loading faction…"}
							{labCount > 0 && (
								<span className="ml-3 text-primary">
									· {labCount} lab{labCount === 1 ? "" : "s"} · −{discountPct}% cost
								</span>
							)}
						</SheetDescription>
					</div>
				</SheetHeader>

				{/* Resource bar */}
				{pool && (
					<div className="grid grid-cols-4 border-b border-border bg-card font-mono text-[10px]">
						{(
							[
								["Money", pool.money],
								["Oil", pool.oil],
								["Steel", pool.steel],
								["Electronics", pool.electronics],
							] as const
						).map(([label, val]) => (
							<div
								key={label}
								className="flex flex-col gap-0.5 border-r border-border px-3 py-2 last:border-r-0"
							>
								<span className="uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
								<span className="text-base text-foreground tabular-nums">{fmtRes(val)}</span>
							</div>
						))}
					</div>
				)}

				{/* Tree picker */}
				<nav className="flex border-b border-border bg-card">
					{TREE_ORDER.map((t) => {
						const has = treeByTree.has(t);
						const active = selectedTree === t;
						return (
							<button
								type="button"
								key={t}
								onClick={() => {
									setSelectedTree(t);
									setSelectedNodeId(null);
								}}
								disabled={!has && !!faction}
								className={`flex-1 border-r border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] last:border-r-0 ${
									active
										? "bg-primary/10 text-primary"
										: "text-muted-foreground hover:bg-accent hover:text-foreground"
								} ${!has ? "opacity-40" : ""}`}
							>
								{TREE_LABELS[t]}
							</button>
						);
					})}
				</nav>

				{/* Active research strip */}
				<ActiveResearchStrip
					projects={research.data?.activeProjects ?? []}
					currentTick={snapshot?.game.tick ?? 0}
					slotMax={researchSlotMax}
					nodesByFaction={trees.data?.trees ?? []}
					onCancel={(projectId) => cancelMutation.mutate(projectId)}
					cancelling={cancelMutation.isPending}
				/>

				{/* Server error banner */}
				{serverError && (
					<div className="border-b border-destructive bg-destructive/10 px-3 py-2 font-mono text-[10px] text-destructive">
						{serverError}
					</div>
				)}

				{/* Body: tree canvas + detail panel */}
				<div className="flex min-h-0 flex-1">
					<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
						{trees.isLoading || research.isLoading ? (
							<div className="flex flex-1 items-center justify-center font-mono text-xs text-muted-foreground">
								Loading research catalog…
							</div>
						) : !activeTree ? (
							<div className="flex flex-1 items-center justify-center font-mono text-xs text-muted-foreground">
								No tree data
							</div>
						) : (
							<TreeCanvas
								tree={activeTree}
								unlocks={research.data?.unlocks ?? []}
								active={research.data?.activeProjects ?? []}
								selectedNodeId={selectedNodeId}
								onSelect={setSelectedNodeId}
							/>
						)}
					</div>

					<aside className="w-[320px] flex-shrink-0 border-l border-border bg-card">
						{selectedNode ? (
							<NodeDetailPanel
								node={selectedNode}
								status={statusForNode(
									selectedNode,
									research.data?.unlocks ?? [],
									research.data?.activeProjects ?? [],
								)}
								unlocks={research.data?.unlocks ?? []}
								active={research.data?.activeProjects ?? []}
								pool={pool}
								discountPct={discountPct}
								slotMax={researchSlotMax}
								onResearch={(id) => startMutation.mutate(id)}
								submitting={startMutation.isPending}
							/>
						) : (
							<div className="flex h-full items-center justify-center px-6 text-center font-mono text-xs text-muted-foreground">
								Select a node to inspect cost, time, and prerequisites.
							</div>
						)}
					</aside>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function ActiveResearchStrip({
	projects,
	currentTick,
	slotMax,
	nodesByFaction,
	onCancel,
	cancelling,
}: {
	projects: ResearchProjectRow[];
	currentTick: number;
	slotMax: number;
	nodesByFaction: ResearchTreeFile[];
	onCancel: (projectId: string) => void;
	cancelling: boolean;
}) {
	const nodeById = useMemo(() => {
		const m = new Map<string, ResearchNode>();
		for (const t of nodesByFaction) for (const n of t.nodes) m.set(n.id, n);
		return m;
	}, [nodesByFaction]);

	// Slot positions are fixed (slot 0, slot 1, …) so the index IS the stable
	// identity here — Biome's array-index-key rule doesn't apply.
	const slots = Array.from({ length: slotMax }, (_, i) => ({
		slotKey: `slot-${i}` as const,
		project: projects[i] ?? null,
	}));

	return (
		<div className="grid grid-cols-2 border-b border-border bg-card">
			{slots.map(({ slotKey, project: p }, i) => {
				if (!p) {
					return (
						<div
							key={slotKey}
							className="flex items-center justify-center border-r border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40 last:border-r-0"
						>
							Slot {i + 1} · empty
						</div>
					);
				}
				const node = nodeById.get(p.nodeId);
				const total = p.expectedCompletionTick - p.startedAtTick;
				const elapsed = Math.max(0, Math.min(total, currentTick - p.startedAtTick));
				const pct = total > 0 ? Math.round((elapsed / total) * 100) : 0;
				const remaining = Math.max(0, p.expectedCompletionTick - currentTick);
				return (
					<div
						key={p.id}
						className="flex flex-col gap-1 border-r border-border px-3 py-2 last:border-r-0"
					>
						<div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em]">
							<span className="text-foreground">
								Slot {i + 1} · {node?.shortName ?? p.nodeId}
							</span>
							<button
								type="button"
								onClick={() => onCancel(p.id)}
								disabled={cancelling}
								className="text-muted-foreground hover:text-destructive disabled:opacity-50"
								title="Cancel (50% refund)"
							>
								<X className="size-3" />
							</button>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-sm bg-border">
							<div className="h-full bg-yellow-500" style={{ width: `${pct}%` }} />
						</div>
						<div className="flex items-baseline justify-between font-mono text-[9px] tabular-nums text-muted-foreground">
							<span>
								{pct}% · {fmtTicks(elapsed)}
							</span>
							<span>ETA {fmtTicks(remaining)}</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function TreeCanvas({
	tree,
	unlocks,
	active,
	selectedNodeId,
	onSelect,
}: {
	tree: ResearchTreeFile;
	unlocks: ResearchUnlockRow[];
	active: ResearchProjectRow[];
	selectedNodeId: string | null;
	onSelect: (id: string) => void;
}) {
	const byTier = useMemo(() => {
		const m = new Map<number, ResearchNode[]>();
		for (const n of tree.nodes) {
			const arr = m.get(n.tier) ?? [];
			arr.push(n);
			m.set(n.tier, arr);
		}
		return m;
	}, [tree.nodes]);

	const tiers = [0, 1, 2, 3, 4] as const;

	return (
		<div className="flex flex-col gap-3">
			{tiers.map((tier) => {
				const nodes = byTier.get(tier) ?? [];
				return (
					<div key={tier} className="flex flex-col gap-2">
						<div className="flex items-baseline gap-3 border-b border-border pb-1">
							<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
								Tier {tier}
							</span>
							<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
								{tier === 0
									? "starter — free"
									: `${nodes.length} ${nodes.length === 1 ? "node" : "nodes"}`}
							</span>
						</div>
						<div className="flex flex-wrap gap-2">
							{nodes.length === 0 && (
								<span className="font-mono text-[10px] text-muted-foreground/60">
									(empty — content lands in 4e)
								</span>
							)}
							{nodes.map((node) => {
								const status = statusForNode(node, unlocks, active);
								const selected = selectedNodeId === node.id;
								const stateClass =
									status === "unlocked"
										? "border-primary/60 bg-primary/10 text-foreground"
										: status === "in_progress"
											? "border-yellow-500/60 bg-yellow-500/10 text-foreground"
											: "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground";
								const ringClass = selected ? "ring-2 ring-primary" : "";
								return (
									<button
										type="button"
										key={node.id}
										onClick={() => onSelect(node.id)}
										className={`flex w-[200px] flex-col gap-1 border px-3 py-2 text-left font-mono text-xs ${stateClass} ${ringClass}`}
									>
										<span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
											{node.shortName}
										</span>
										<span className="leading-tight text-foreground">{node.displayName}</span>
										<span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
											{status === "unlocked"
												? "● Unlocked"
												: status === "in_progress"
													? "◐ Researching"
													: "○ Locked"}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function NodeDetailPanel({
	node,
	status,
	unlocks,
	active,
	pool,
	discountPct,
	slotMax,
	onResearch,
	submitting,
}: {
	node: ResearchNode;
	status: NodeStatus;
	unlocks: ResearchUnlockRow[];
	active: ResearchProjectRow[];
	pool: Pool | null;
	discountPct: number;
	slotMax: number;
	onResearch: (nodeId: string) => void;
	submitting: boolean;
}) {
	const statusLabel =
		status === "unlocked" ? "● Unlocked" : status === "in_progress" ? "◐ Researching" : "○ Locked";
	const statusClass =
		status === "unlocked"
			? "text-primary"
			: status === "in_progress"
				? "text-yellow-500"
				: "text-muted-foreground";

	const costPostDiscount = applyDiscount(node.cost, discountPct);
	const reason = computeStartReason(node, unlocks, active, pool, costPostDiscount, slotMax);
	const canStart = reason === "ok" && !submitting;

	return (
		<div className="flex h-full flex-col gap-0">
			<div className="border-b border-border px-3 py-3">
				<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					{node.shortName} · Tier {node.tier} · {node.introYear}
				</div>
				<h3 className="mt-1 font-mono text-sm leading-tight text-foreground">{node.displayName}</h3>
				<div className={`mt-2 font-mono text-[10px] uppercase tracking-[0.18em] ${statusClass}`}>
					{statusLabel}
				</div>
			</div>

			<div className="border-b border-border px-3 py-2">
				<div className="flex items-baseline justify-between">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Cost
					</span>
					{discountPct > 0 && node.tier > 0 && (
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
							−{discountPct}% lab discount
						</span>
					)}
				</div>
				{node.tier === 0 ? (
					<div className="mt-1 font-mono text-xs text-muted-foreground">
						Free starter pack — already unlocked.
					</div>
				) : (
					<div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-xs tabular-nums">
						<span className="text-muted-foreground">Money</span>
						<span className="text-right text-foreground">{fmtRes(costPostDiscount.money)}</span>
						<span className="text-muted-foreground">Oil</span>
						<span className="text-right text-foreground">{fmtRes(costPostDiscount.oil)}</span>
						<span className="text-muted-foreground">Steel</span>
						<span className="text-right text-foreground">{fmtRes(costPostDiscount.steel)}</span>
						<span className="text-muted-foreground">Electronics</span>
						<span className="text-right text-foreground">
							{fmtRes(costPostDiscount.electronics)}
						</span>
					</div>
				)}
			</div>

			<div className="border-b border-border px-3 py-2">
				<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					Research time
				</div>
				<div className="mt-1 font-mono text-xs text-foreground">
					{node.tier === 0
						? "Instant (starter)"
						: `${fmtTicks(node.researchTimeTicks)} (${node.researchTimeTicks} ticks)`}
				</div>
			</div>

			<div className="border-b border-border px-3 py-2">
				<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					Prerequisites
				</div>
				{node.prereqs.length === 0 ? (
					<div className="mt-1 font-mono text-xs text-muted-foreground">None</div>
				) : (
					<ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
						{node.prereqs.map((p) => {
							const have = unlocks.some((u) => u.nodeId === p);
							return (
								<li key={p} className={have ? "text-primary" : "text-muted-foreground"}>
									{have ? "✓" : "·"} {p}
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<div className="border-b border-border px-3 py-2">
				<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					Unlocks
				</div>
				<ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
					{node.unlocks.unitTypes.map((u) => (
						<li key={u} className="text-foreground">
							· {u}
						</li>
					))}
					{node.unlocks.systems?.map((s) => (
						<li key={s} className="text-primary">
							⚡ system: {s}
						</li>
					))}
				</ul>
			</div>

			<div className="mt-auto p-3">
				<Button
					disabled={!canStart}
					onClick={() => onResearch(node.id)}
					title={reason === "ok" ? "Submit start_research order" : reasonLabel(reason)}
					className="w-full font-mono text-[10px] uppercase tracking-[0.18em]"
				>
					{submitting ? "Submitting…" : reasonLabel(reason)}
				</Button>
			</div>
		</div>
	);
}
