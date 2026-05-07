/*
 * Phase 4c — research order validation + applier.
 *
 * Mirrors the Phase 3 building order pattern (buildings.ts): start_research /
 * cancel_research are validated + applied at REST time under the per-game
 * row lock, so the client gets a synchronous accept (with a real
 * research_project row) or a 4xx with a reason.
 *
 * Cost is debited atomically on accept, post-lab-discount. The lab discount
 * is computed from completed `research_lab` buildings owned by the player
 * (capped at stackCap from buildings.json). The post-discount amounts are
 * snapshotted into the research_project row so cancel refund (50%) reads
 * from the snapshot — the discount can change between start and cancel
 * (more labs built) but the refund is anchored to what the player actually
 * paid.
 */

import { newId, schema } from "@geopolitik/db";
import { getBuildingDef } from "@geopolitik/shared/buildings";
import { factionForCountry } from "@geopolitik/shared/factions";
import { findNode } from "@geopolitik/shared/research";
import type { ResearchCost, ResearchNode } from "@geopolitik/shared/research";
import { and, eq, sql } from "drizzle-orm";
import type { db as Database } from "./db";

type Tx = Parameters<Parameters<typeof Database.transaction>[0]>[0];

export type StartResearchInput = { nodeId: string };
export type CancelResearchInput = { projectId: string };

export type StartResearchAcceptResult =
	| {
			ok: true;
			projectId: string;
			expectedCompletionTick: number;
			costSnapshot: { money: number; oil: number; steel: number; electronics: number };
	  }
	| {
			ok: false;
			reason:
				| "not_a_player"
				| "no_faction"
				| "node_not_found"
				| "wrong_faction"
				| "tier_zero_not_researchable"
				| "already_unlocked"
				| "already_in_progress"
				| "missing_prereqs"
				| "slots_full"
				| "insufficient_resources";
	  };

export type CancelResearchAcceptResult =
	| {
			ok: true;
			refund: { money: number; oil: number; steel: number; electronics: number };
	  }
	| { ok: false; reason: "project_not_found" | "not_in_progress" | "not_owner" };

/*
 * Pure helpers — usable from tests without a DB transaction.
 */

export function labDiscountPct(labCount: number): number {
	const def = getBuildingDef("research_lab");
	const eff = def?.effects;
	if (!eff?.researchCostDiscountPct || !eff?.stackCap) return 0;
	const effective = Math.min(Math.max(labCount, 0), eff.stackCap);
	return effective * eff.researchCostDiscountPct;
}

export function applyDiscountToCost(
	cost: ResearchCost,
	discountPct: number,
): { money: number; oil: number; steel: number; electronics: number } {
	const factor = Math.max(0, 100 - discountPct);
	return {
		money: Math.floor(((cost.money ?? 0) * factor) / 100),
		oil: Math.floor(((cost.oil ?? 0) * factor) / 100),
		steel: Math.floor(((cost.steel ?? 0) * factor) / 100),
		electronics: Math.floor(((cost.electronics ?? 0) * factor) / 100),
	};
}

export function researchCancelRefund(snapshot: {
	money: number;
	oil: number;
	steel: number;
	electronics: number;
}): { money: number; oil: number; steel: number; electronics: number } {
	return {
		money: Math.floor(snapshot.money / 2),
		oil: Math.floor(snapshot.oil / 2),
		steel: Math.floor(snapshot.steel / 2),
		electronics: Math.floor(snapshot.electronics / 2),
	};
}

export function nodeIsAffordable(
	costPostDiscount: { money: number; oil: number; steel: number; electronics: number },
	balance: { money: number; oil: number; steel: number; electronics: number },
): boolean {
	return (
		costPostDiscount.money <= balance.money &&
		costPostDiscount.oil <= balance.oil &&
		costPostDiscount.steel <= balance.steel &&
		costPostDiscount.electronics <= balance.electronics
	);
}

/*
 * applyStartResearch — full accept / reject pipeline under tx + per-game lock.
 */
export async function applyStartResearch(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: StartResearchInput,
): Promise<StartResearchAcceptResult> {
	const [me] = await tx
		.select({
			id: schema.player.id,
			countryCode: schema.player.countryCode,
		})
		.from(schema.player)
		.where(and(eq(schema.player.id, playerId), eq(schema.player.gameId, gameId)))
		.limit(1);
	if (!me) return { ok: false, reason: "not_a_player" };

	const faction = factionForCountry(me.countryCode);
	if (!faction) return { ok: false, reason: "no_faction" };

	const node: ResearchNode | undefined = findNode(faction, input.nodeId);
	if (!node) return { ok: false, reason: "node_not_found" };

	// Tier 0 is the free starter pack — pre-unlocked at game start, never
	// researchable through this path.
	if (node.tier === 0) return { ok: false, reason: "tier_zero_not_researchable" };

	// Already unlocked?
	const [existingUnlock] = await tx
		.select({ nodeId: schema.researchUnlock.nodeId })
		.from(schema.researchUnlock)
		.where(
			and(
				eq(schema.researchUnlock.gameId, gameId),
				eq(schema.researchUnlock.playerId, playerId),
				eq(schema.researchUnlock.nodeId, input.nodeId),
			),
		)
		.limit(1);
	if (existingUnlock) return { ok: false, reason: "already_unlocked" };

	// Already in progress? (Partial unique index on the table also enforces
	// this at the storage layer; checking here gives a friendlier reject.)
	const [existingActive] = await tx
		.select({ id: schema.researchProject.id })
		.from(schema.researchProject)
		.where(
			and(
				eq(schema.researchProject.gameId, gameId),
				eq(schema.researchProject.playerId, playerId),
				eq(schema.researchProject.nodeId, input.nodeId),
				eq(schema.researchProject.status, "in_progress"),
			),
		)
		.limit(1);
	if (existingActive) return { ok: false, reason: "already_in_progress" };

	// Prereqs all unlocked?
	if (node.prereqs.length > 0) {
		const unlocks = await tx
			.select({ nodeId: schema.researchUnlock.nodeId })
			.from(schema.researchUnlock)
			.where(
				and(eq(schema.researchUnlock.gameId, gameId), eq(schema.researchUnlock.playerId, playerId)),
			);
		const have = new Set(unlocks.map((u) => u.nodeId));
		for (const p of node.prereqs) {
			if (!have.has(p)) return { ok: false, reason: "missing_prereqs" };
		}
	}

	// Slot count: < research_slot_max active projects.
	const [nation] = await tx
		.select({
			money: schema.nationState.money,
			oil: schema.nationState.oil,
			steel: schema.nationState.steel,
			electronics: schema.nationState.electronics,
			researchSlotMax: schema.nationState.researchSlotMax,
		})
		.from(schema.nationState)
		.where(and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, playerId)))
		.limit(1);
	if (!nation) return { ok: false, reason: "not_a_player" };

	const activeCount = await tx
		.select({ n: sql<number>`COUNT(*)::int` })
		.from(schema.researchProject)
		.where(
			and(
				eq(schema.researchProject.gameId, gameId),
				eq(schema.researchProject.playerId, playerId),
				eq(schema.researchProject.status, "in_progress"),
			),
		);
	const inProgress = activeCount[0]?.n ?? 0;
	if (inProgress >= nation.researchSlotMax) return { ok: false, reason: "slots_full" };

	// Lab cost discount: count completed research_lab buildings owned by the
	// player. Per-defection invariant from buildings.ts: yields stop counting
	// when the host city defects, so we only count buildings whose host city
	// is still owned by the builder.
	const labRows = await tx
		.select({ n: sql<number>`COUNT(*)::int` })
		.from(schema.cityBuilding)
		.innerJoin(schema.cityState, eq(schema.cityState.cityId, schema.cityBuilding.cityId))
		.where(
			and(
				eq(schema.cityBuilding.gameId, gameId),
				eq(schema.cityBuilding.builtByPlayerId, playerId),
				eq(schema.cityBuilding.type, "research_lab"),
				eq(schema.cityBuilding.state, "complete"),
				eq(schema.cityState.gameId, gameId),
				eq(schema.cityState.ownerPlayerId, playerId),
			),
		);
	const labCount = labRows[0]?.n ?? 0;
	const discountPct = labDiscountPct(labCount);
	const costPostDiscount = applyDiscountToCost(node.cost, discountPct);

	if (!nodeIsAffordable(costPostDiscount, nation)) {
		return { ok: false, reason: "insufficient_resources" };
	}

	await tx
		.update(schema.nationState)
		.set({
			money: sql`${schema.nationState.money} - ${costPostDiscount.money}`,
			oil: sql`${schema.nationState.oil} - ${costPostDiscount.oil}`,
			steel: sql`${schema.nationState.steel} - ${costPostDiscount.steel}`,
			electronics: sql`${schema.nationState.electronics} - ${costPostDiscount.electronics}`,
			updatedAt: new Date(),
		})
		.where(and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, playerId)));

	const projectId = newId();
	const expectedCompletionTick = currentTick + node.researchTimeTicks;
	await tx.insert(schema.researchProject).values({
		id: projectId,
		gameId,
		playerId,
		nodeId: node.id,
		status: "in_progress",
		costMoney: costPostDiscount.money,
		costOil: costPostDiscount.oil,
		costSteel: costPostDiscount.steel,
		costElectronics: costPostDiscount.electronics,
		startedAtTick: currentTick,
		expectedCompletionTick,
	});

	return {
		ok: true,
		projectId,
		expectedCompletionTick,
		costSnapshot: costPostDiscount,
	};
}

/*
 * applyCancelResearch — refund 50% of paid (post-discount) cost, mark the
 * project cancelled. Slot frees as a consequence (the active-count query
 * filters by status='in_progress', so a cancelled row stops blocking).
 */
export async function applyCancelResearch(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: CancelResearchInput,
): Promise<CancelResearchAcceptResult> {
	const [project] = await tx
		.select()
		.from(schema.researchProject)
		.where(
			and(
				eq(schema.researchProject.id, input.projectId),
				eq(schema.researchProject.gameId, gameId),
			),
		)
		.limit(1);
	if (!project) return { ok: false, reason: "project_not_found" };
	if (project.playerId !== playerId) return { ok: false, reason: "not_owner" };
	if (project.status !== "in_progress") return { ok: false, reason: "not_in_progress" };

	const refund = researchCancelRefund({
		money: project.costMoney,
		oil: project.costOil,
		steel: project.costSteel,
		electronics: project.costElectronics,
	});

	await tx
		.update(schema.nationState)
		.set({
			money: sql`${schema.nationState.money} + ${refund.money}`,
			oil: sql`${schema.nationState.oil} + ${refund.oil}`,
			steel: sql`${schema.nationState.steel} + ${refund.steel}`,
			electronics: sql`${schema.nationState.electronics} + ${refund.electronics}`,
			updatedAt: new Date(),
		})
		.where(and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, playerId)));

	await tx
		.update(schema.researchProject)
		.set({ status: "cancelled", resolvedAtTick: currentTick })
		.where(eq(schema.researchProject.id, input.projectId));

	return { ok: true, refund };
}
