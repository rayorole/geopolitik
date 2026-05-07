"use client";

import { Button } from "@/components/ui/button";
import { gamesApi, queryKeys, worldApi } from "@/lib/api-client";
import type { CityBuildingInSnapshot, GameSnapshot } from "@geopolitik/shared/api";
import type { BuildingDef, BuildingsCatalog } from "@geopolitik/shared/buildings";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hammer, Loader2, X } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

/*
 * Buildings + builder UI inside CityDetail. Lives in its own file because
 * city-detail.tsx is already big and 3d adds another ~150 lines of building
 * specific layout + mutation wiring.
 *
 * Server is the source of truth for everything here:
 *   - cityBuildings comes from snapshot (refreshed on tick deltas in 3d-WS).
 *   - Build / cancel mutations submit orders that the API applies under the
 *     per-game lock — the response includes the new state, so we just refetch
 *     the snapshot on success rather than maintaining a parallel cache shape.
 */

const RES_DIVISOR = 100;

function fmtRes(n: number): string {
	return (n / RES_DIVISOR).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtBuildTime(ticks: number): string {
	const seconds = ticks * 30;
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round((seconds / 3600) * 10) / 10;
	return `${hours}h`;
}

export function CityBuildingsSection({
	gameId,
	cityId,
	snapshot,
}: {
	gameId: string;
	cityId: string;
	snapshot: GameSnapshot;
}) {
	const catalog = useQuery({
		queryKey: queryKeys.worldBuildings,
		queryFn: worldApi.buildings,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
	});

	if (!catalog.data) {
		return (
			<div className="border border-dashed border-border bg-card/40 px-3 py-3 font-mono text-[10px] text-muted-foreground">
				Loading building catalog…
			</div>
		);
	}

	return (
		<CityBuildingsBody gameId={gameId} cityId={cityId} snapshot={snapshot} catalog={catalog.data} />
	);
}

function CityBuildingsBody({
	gameId,
	cityId,
	snapshot,
	catalog,
}: {
	gameId: string;
	cityId: string;
	snapshot: GameSnapshot;
	catalog: BuildingsCatalog;
}) {
	const queryClient = useQueryClient();

	const { complete, inProgress } = useMemo(() => {
		// snapshot.cityBuildings is required at the type level but a stale
		// snapshot from a pre-3d API can omit it. Defend with `?? []`.
		const all = snapshot.cityBuildings ?? [];
		const cityBuildings = all.filter((b) => b.cityId === cityId);
		return {
			complete: cityBuildings.filter((b) => b.state === "complete"),
			inProgress: cityBuildings.filter((b) => b.state === "in_progress"),
		};
	}, [snapshot.cityBuildings, cityId]);

	const myNation = useMemo(
		() => snapshot.nationState.find((n) => n.playerId === snapshot.mePlayerId),
		[snapshot.nationState, snapshot.mePlayerId],
	);

	const occupiedTypes = useMemo(() => {
		return new Set([...complete.map((b) => b.type), ...inProgress.map((b) => b.type)]);
	}, [complete, inProgress]);

	const refetchSnapshot = () =>
		queryClient.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });

	const buildMutation = useMutation({
		mutationFn: (type: string) =>
			gamesApi.submitOrder(gameId, { kind: "build", payload: { cityId, type } }),
		onSuccess: (_data, type) => {
			toast.success(`${displayName(catalog, type)} build started`);
			void refetchSnapshot();
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const cancelMutation = useMutation({
		mutationFn: (buildingId: string) =>
			gamesApi.submitOrder(gameId, { kind: "cancel_build", payload: { buildingId } }),
		onSuccess: () => {
			toast.success("Build cancelled, 50% refunded");
			void refetchSnapshot();
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const currentTick = snapshot.game.tick;

	return (
		<div className="border border-dashed border-border bg-card/40">
			<div className="flex items-center justify-between border-b border-border bg-card/60 px-3 py-1.5">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
					Buildings
				</span>
				<span className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
					{complete.length}/{catalog.buildings.length}
				</span>
			</div>

			{/* Built */}
			{complete.length > 0 && (
				<ul className="border-b border-border">
					{complete.map((b) => (
						<BuiltRow key={b.id} building={b} catalog={catalog} />
					))}
				</ul>
			)}

			{/* In progress */}
			{inProgress.length > 0 && (
				<ul className="border-b border-border">
					{inProgress.map((b) => (
						<InProgressRow
							key={b.id}
							building={b}
							catalog={catalog}
							currentTick={currentTick}
							onCancel={() => cancelMutation.mutate(b.id)}
							cancelling={cancelMutation.isPending}
						/>
					))}
				</ul>
			)}

			{/* Builder */}
			<div className="px-3 py-2">
				<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					Build
				</div>
				<ul className="mt-1.5 flex flex-col">
					{catalog.buildings.map((def) => (
						<BuilderRow
							key={def.type}
							def={def}
							balance={
								myNation
									? {
											money: myNation.money,
											oil: myNation.oil,
											steel: myNation.steel,
											electronics: myNation.electronics,
										}
									: { money: 0, oil: 0, steel: 0, electronics: 0 }
							}
							occupied={occupiedTypes.has(def.type)}
							onBuild={() => buildMutation.mutate(def.type)}
							building={buildMutation.isPending && buildMutation.variables === def.type}
						/>
					))}
				</ul>
			</div>
		</div>
	);
}

function displayName(catalog: BuildingsCatalog, type: string): string {
	return catalog.buildings.find((b) => b.type === type)?.displayName ?? type;
}

function BuiltRow({
	building,
	catalog,
}: {
	building: CityBuildingInSnapshot;
	catalog: BuildingsCatalog;
}) {
	const def = catalog.buildings.find((b) => b.type === building.type);
	if (!def) return null;
	return (
		<li className="flex items-baseline justify-between gap-2 px-3 py-1.5 font-mono text-xs">
			<span className="text-foreground">{def.displayName}</span>
			<span className="text-right text-[10px] tabular-nums text-muted-foreground">
				{summarizeYield(def)}
			</span>
		</li>
	);
}

function summarizeYield(def: BuildingDef): string {
	const y = def.nationYieldPerTick;
	const parts: string[] = [];
	if (y.money) parts.push(`${fmtRes(y.money)} money`);
	if (y.oil) parts.push(`${fmtRes(y.oil)} oil`);
	if (y.steel) parts.push(`${fmtRes(y.steel)} steel`);
	if (y.electronics) parts.push(`${fmtRes(y.electronics)} electronics`);
	const eff = def.effects;
	if (eff?.researchCostDiscountPct) {
		parts.push(`-${eff.researchCostDiscountPct}% research cost (cap ${eff.stackCap ?? "∞"})`);
	}
	if (eff?.economyYieldBoostPct) {
		parts.push(`+${eff.economyYieldBoostPct}% economy yield (cap ${eff.stackCap ?? "∞"})`);
	}
	if (parts.length === 0) return "no yield (P5)";
	return parts.join(", ");
}

function InProgressRow({
	building,
	catalog,
	currentTick,
	onCancel,
	cancelling,
}: {
	building: CityBuildingInSnapshot;
	catalog: BuildingsCatalog;
	currentTick: number;
	onCancel: () => void;
	cancelling: boolean;
}) {
	const def = catalog.buildings.find((b) => b.type === building.type);
	if (!def) return null;
	const total = def.buildTimeTicks;
	const elapsed = Math.max(0, currentTick - building.startedAtTick);
	const remaining = Math.max(0, total - elapsed);
	const pct = Math.max(0, Math.min(100, Math.floor((elapsed / total) * 100)));
	return (
		<li className="flex flex-col gap-1 px-3 py-2 font-mono text-xs">
			<div className="flex items-baseline justify-between gap-2">
				<span className="inline-flex items-baseline gap-1.5 text-foreground">
					<Loader2 className="size-3 animate-spin self-center text-primary" aria-hidden />
					{def.displayName}
				</span>
				<span className="text-[10px] tabular-nums text-muted-foreground">
					{remaining}t left · {fmtBuildTime(remaining)}
				</span>
			</div>
			<div className="h-1.5 w-full overflow-hidden bg-border">
				<div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
			</div>
			<div className="flex justify-end">
				<Button
					variant="ghost"
					size="xs"
					onClick={onCancel}
					disabled={cancelling}
					className="h-5 px-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-destructive hover:bg-destructive/10"
				>
					<X className="size-3" aria-hidden />
					Cancel · 50% refund
				</Button>
			</div>
		</li>
	);
}

function BuilderRow({
	def,
	balance,
	occupied,
	onBuild,
	building,
}: {
	def: BuildingDef;
	balance: { money: number; oil: number; steel: number; electronics: number };
	occupied: boolean;
	onBuild: () => void;
	building: boolean;
}) {
	const affordable =
		(def.cost.money ?? 0) <= balance.money &&
		(def.cost.steel ?? 0) <= balance.steel &&
		(def.cost.oil ?? 0) <= balance.oil &&
		(def.cost.electronics ?? 0) <= balance.electronics;
	const disabled = occupied || !affordable || building;
	return (
		<li className="border-t border-border py-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-foreground">{def.displayName}</span>
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
					{def.category}
				</span>
			</div>
			<div className="grid grid-cols-2 gap-x-2 gap-y-0 font-mono text-[10px] text-muted-foreground tabular-nums">
				<span>Cost {summarizeCost(def)}</span>
				<span className="text-right">{fmtBuildTime(def.buildTimeTicks)}</span>
				<span className="col-span-2">{summarizeYield(def)}</span>
			</div>
			<div className="mt-1 flex justify-end">
				<Button
					variant="ghost"
					size="xs"
					onClick={onBuild}
					disabled={disabled}
					className={`h-6 px-2 font-mono text-[10px] uppercase tracking-[0.18em] ${
						disabled ? "text-muted-foreground" : "text-primary hover:bg-primary/10"
					}`}
				>
					<Hammer className="size-3" aria-hidden />
					{occupied ? "Built" : !affordable ? "Insufficient" : building ? "Queueing…" : "Build"}
				</Button>
			</div>
		</li>
	);
}

function summarizeCost(def: BuildingDef): string {
	const c = def.cost;
	const parts: string[] = [];
	if (c.money) parts.push(`${fmtRes(c.money)} money`);
	if (c.steel) parts.push(`${fmtRes(c.steel)} steel`);
	if (c.oil) parts.push(`${fmtRes(c.oil)} oil`);
	if (c.electronics) parts.push(`${fmtRes(c.electronics)} electronics`);
	return parts.join(", ");
}
