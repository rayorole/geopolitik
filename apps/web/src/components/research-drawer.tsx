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
import type {
	PlayerResearchResponse,
	ResearchProjectRow,
	ResearchUnlockRow,
} from "@geopolitik/shared/api";
import type { FactionId } from "@geopolitik/shared/factions";
import type { ResearchNode, ResearchTreeFile, TreeId } from "@geopolitik/shared/research";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { useMemo, useState } from "react";

/*
 * Research drawer — Phase 4b.
 *
 * Bottom drawer that slides up fullscreen over the map. Read-only in 4b:
 * the player can browse their faction's 7 trees, see tier-0 starter
 * unlocks, and inspect locked tier-1 nodes. The "Research" button on the
 * detail panel is rendered but inert — it goes live in 4c (#36) when
 * start_research / cancel_research orders land.
 *
 * Map stays mounted under the drawer so dismissal returns to game state
 * without a route change. TanStack Query handles the data: snapshot keys
 * stay independent so the drawer doesn't invalidate the live game tick.
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
	// 30s ticks. Show as minutes/hours.
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

export function ResearchDrawer({
	gameId,
	mePlayerId,
}: {
	gameId: string;
	mePlayerId: string | null;
}) {
	const [open, setOpen] = useState(false);
	const [selectedTree, setSelectedTree] = useState<TreeId>("ground");
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

	const research = useQuery({
		queryKey: queryKeys.gameResearch(gameId),
		queryFn: () => gamesApi.research(gameId),
		enabled: open && !!mePlayerId,
	});

	const faction: FactionId | undefined = research.data?.faction;

	const trees = useQuery({
		queryKey: faction ? queryKeys.worldResearchTrees(faction) : ["world", "research", "none"],
		queryFn: () => worldApi.researchTrees(faction!),
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
						</SheetDescription>
					</div>
				</SheetHeader>

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
	// Group nodes by tier; render tier rows top-to-bottom (0 → 4).
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
}: {
	node: ResearchNode;
	status: NodeStatus;
}) {
	const statusLabel =
		status === "unlocked" ? "● Unlocked" : status === "in_progress" ? "◐ Researching" : "○ Locked";
	const statusClass =
		status === "unlocked"
			? "text-primary"
			: status === "in_progress"
				? "text-yellow-500"
				: "text-muted-foreground";

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
				<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					Cost
				</div>
				{node.tier === 0 ? (
					<div className="mt-1 font-mono text-xs text-muted-foreground">
						Free starter pack — already unlocked.
					</div>
				) : (
					<div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-xs tabular-nums">
						<span className="text-muted-foreground">Money</span>
						<span className="text-right text-foreground">{fmtRes(node.cost.money)}</span>
						<span className="text-muted-foreground">Oil</span>
						<span className="text-right text-foreground">{fmtRes(node.cost.oil)}</span>
						<span className="text-muted-foreground">Steel</span>
						<span className="text-right text-foreground">{fmtRes(node.cost.steel)}</span>
						<span className="text-muted-foreground">Electronics</span>
						<span className="text-right text-foreground">{fmtRes(node.cost.electronics)}</span>
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
						{node.prereqs.map((p) => (
							<li key={p} className="text-foreground">
								· {p}
							</li>
						))}
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
					disabled
					title="Order kinds land in Phase 4c"
					className="w-full font-mono text-[10px] uppercase tracking-[0.18em]"
				>
					Research (4c)
				</Button>
			</div>
		</div>
	);
}
