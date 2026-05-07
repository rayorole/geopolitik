/*
 * Phase 3d order validation + tick maturation helpers.
 *
 * Build / cancel_build are validated and applied at REST time (under a
 * per-game lock) so the client gets a synchronous 201 with a real city_
 * building row, or a 4xx with a reason. The tick worker only matures rows
 * whose completes_at_tick has elapsed and aggregates per-nation yields.
 *
 * Ownership is re-checked at maturation: if a city defected since the
 * build order was placed, the in-progress row is cancelled rather than
 * matured (the former owner's investment is forfeited; per the 3e spec
 * defection wipes pending builds without refund).
 */

import { newId, schema } from "@geopolitik/db";
import {
	BUILDINGS_CATALOG,
	type BuildingCost,
	type BuildingYield,
	getBuildingDef,
} from "@geopolitik/shared/buildings";
import { and, eq, sql } from "drizzle-orm";
import type { db as Database } from "./db";

type Tx = Parameters<Parameters<typeof Database.transaction>[0]>[0];

export type ResourceBalance = {
	money: number;
	oil: number;
	steel: number;
	electronics: number;
};

/*
 * Pure helpers — usable from tests without a DB transaction. The
 * Tx-flavored applyBuildOrder etc. below are thin orchestration on top of
 * these and the DB read / write SQL.
 */

export function isAffordable(cost: BuildingCost, balance: ResourceBalance): boolean {
	return (
		(cost.money ?? 0) <= balance.money &&
		(cost.steel ?? 0) <= balance.steel &&
		(cost.oil ?? 0) <= balance.oil &&
		(cost.electronics ?? 0) <= balance.electronics
	);
}

export function cancelRefund(cost: BuildingCost): ResourceBalance {
	return {
		money: Math.floor((cost.money ?? 0) / 2),
		steel: Math.floor((cost.steel ?? 0) / 2),
		oil: Math.floor((cost.oil ?? 0) / 2),
		electronics: Math.floor((cost.electronics ?? 0) / 2),
	};
}

export type AggregateYieldRow = {
	type: string;
	builtByPlayerId: string;
	ownerPlayerId: string | null;
};

export function aggregateBuildingYields(
	rows: AggregateYieldRow[],
): Map<string, { money: number; oil: number; steel: number; electronics: number }> {
	const out = new Map<string, { money: number; oil: number; steel: number; electronics: number }>();
	for (const row of rows) {
		// Defected cities don't yield to the former owner — Q7a invariant.
		if (row.ownerPlayerId !== row.builtByPlayerId) continue;
		const def = getBuildingDef(row.type);
		if (!def) continue;
		const y: BuildingYield = def.nationYieldPerTick;
		const acc = out.get(row.builtByPlayerId) ?? {
			money: 0,
			oil: 0,
			steel: 0,
			electronics: 0,
		};
		acc.money += y.money ?? 0;
		acc.oil += y.oil ?? 0;
		acc.steel += y.steel ?? 0;
		acc.electronics += y.electronics ?? 0;
		out.set(row.builtByPlayerId, acc);
	}
	return out;
}

export type BuildOrderInput = { cityId: string; type: string };
export type CancelBuildInput = { buildingId: string };

export type BuildAcceptResult =
	| { ok: true; buildingId: string; completesAtTick: number }
	| {
			ok: false;
			reason:
				| "city_not_found"
				| "city_not_owned"
				| "unknown_building_type"
				| "duplicate_building"
				| "insufficient_resources";
	  };

/*
 * Validates and applies a build order under the caller's transaction.
 * Caller is responsible for the per-game row lock (FOR UPDATE) — same
 * pattern the tick worker uses, so REST and tick can't race.
 */
export async function applyBuildOrder(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: BuildOrderInput,
): Promise<BuildAcceptResult> {
	const def = getBuildingDef(input.type);
	if (!def) return { ok: false, reason: "unknown_building_type" };

	const [city] = await tx
		.select({ ownerPlayerId: schema.cityState.ownerPlayerId })
		.from(schema.cityState)
		.where(and(eq(schema.cityState.gameId, gameId), eq(schema.cityState.cityId, input.cityId)))
		.limit(1);
	if (!city) return { ok: false, reason: "city_not_found" };
	if (city.ownerPlayerId !== playerId) return { ok: false, reason: "city_not_owned" };

	const existing = await tx
		.select({ id: schema.cityBuilding.id })
		.from(schema.cityBuilding)
		.where(
			and(
				eq(schema.cityBuilding.gameId, gameId),
				eq(schema.cityBuilding.cityId, input.cityId),
				eq(schema.cityBuilding.type, input.type),
				sql`${schema.cityBuilding.state} IN ('in_progress', 'complete')`,
			),
		)
		.limit(1);
	if (existing.length > 0) return { ok: false, reason: "duplicate_building" };

	const [nation] = await tx
		.select({
			money: schema.nationState.money,
			oil: schema.nationState.oil,
			steel: schema.nationState.steel,
			electronics: schema.nationState.electronics,
		})
		.from(schema.nationState)
		.where(and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, playerId)))
		.limit(1);
	if (!nation) return { ok: false, reason: "city_not_owned" };

	const cost = def.cost;
	if ((cost.money ?? 0) > nation.money) return { ok: false, reason: "insufficient_resources" };
	if ((cost.steel ?? 0) > nation.steel) return { ok: false, reason: "insufficient_resources" };
	if ((cost.oil ?? 0) > nation.oil) return { ok: false, reason: "insufficient_resources" };
	if ((cost.electronics ?? 0) > nation.electronics)
		return { ok: false, reason: "insufficient_resources" };

	await tx
		.update(schema.nationState)
		.set({
			money: sql`${schema.nationState.money} - ${cost.money ?? 0}`,
			steel: sql`${schema.nationState.steel} - ${cost.steel ?? 0}`,
			oil: sql`${schema.nationState.oil} - ${cost.oil ?? 0}`,
			electronics: sql`${schema.nationState.electronics} - ${cost.electronics ?? 0}`,
			updatedAt: new Date(),
		})
		.where(and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, playerId)));

	const buildingId = newId();
	const completesAtTick = currentTick + def.buildTimeTicks;
	await tx.insert(schema.cityBuilding).values({
		id: buildingId,
		gameId,
		cityId: input.cityId,
		type: input.type,
		state: "in_progress",
		startedAtTick: currentTick,
		completesAtTick,
		builtByPlayerId: playerId,
	});

	return { ok: true, buildingId, completesAtTick };
}

export type CancelAcceptResult =
	| { ok: true; refund: { money: number; oil: number; steel: number; electronics: number } }
	| { ok: false; reason: "building_not_found" | "not_in_progress" | "not_owner" };

export async function applyCancelBuildOrder(
	tx: Tx,
	gameId: string,
	playerId: string,
	input: CancelBuildInput,
): Promise<CancelAcceptResult> {
	const [b] = await tx
		.select()
		.from(schema.cityBuilding)
		.where(
			and(eq(schema.cityBuilding.id, input.buildingId), eq(schema.cityBuilding.gameId, gameId)),
		)
		.limit(1);
	if (!b) return { ok: false, reason: "building_not_found" };
	if (b.state !== "in_progress") return { ok: false, reason: "not_in_progress" };
	if (b.builtByPlayerId !== playerId) return { ok: false, reason: "not_owner" };

	const def = getBuildingDef(b.type);
	const cost = def?.cost ?? {};
	const refund = {
		money: Math.floor((cost.money ?? 0) / 2),
		oil: Math.floor((cost.oil ?? 0) / 2),
		steel: Math.floor((cost.steel ?? 0) / 2),
		electronics: Math.floor((cost.electronics ?? 0) / 2),
	};

	await tx
		.update(schema.nationState)
		.set({
			money: sql`${schema.nationState.money} + ${refund.money}`,
			steel: sql`${schema.nationState.steel} + ${refund.steel}`,
			oil: sql`${schema.nationState.oil} + ${refund.oil}`,
			electronics: sql`${schema.nationState.electronics} + ${refund.electronics}`,
			updatedAt: new Date(),
		})
		.where(and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, playerId)));

	await tx
		.update(schema.cityBuilding)
		.set({ state: "cancelled", completesAtTick: null })
		.where(eq(schema.cityBuilding.id, b.id));

	return { ok: true, refund };
}

/*
 * Maturation step inside the tick. Returns matured rows (so the worker can
 * emit building_complete events) and a per-player flat-yield aggregate
 * (summed across all complete buildings whose host city is still owned by
 * the builder).
 */
export type MaturationOutcome = {
	matured: { id: string; cityId: string; playerId: string; type: string }[];
	yieldByPlayer: Map<string, { money: number; oil: number; steel: number; electronics: number }>;
};

export async function matureBuildingsAndComputeYields(
	tx: Tx,
	gameId: string,
	currentTick: number,
): Promise<MaturationOutcome> {
	// Mature: in_progress + completes_at_tick reached + city still owned by builder.
	const due = await tx
		.select({
			id: schema.cityBuilding.id,
			cityId: schema.cityBuilding.cityId,
			builtByPlayerId: schema.cityBuilding.builtByPlayerId,
			type: schema.cityBuilding.type,
			ownerPlayerId: schema.cityState.ownerPlayerId,
		})
		.from(schema.cityBuilding)
		.innerJoin(
			schema.cityState,
			and(
				eq(schema.cityState.gameId, schema.cityBuilding.gameId),
				eq(schema.cityState.cityId, schema.cityBuilding.cityId),
			),
		)
		.where(
			and(
				eq(schema.cityBuilding.gameId, gameId),
				eq(schema.cityBuilding.state, "in_progress"),
				sql`${schema.cityBuilding.completesAtTick} <= ${currentTick}`,
			),
		);

	const matured: MaturationOutcome["matured"] = [];
	for (const row of due) {
		if (row.ownerPlayerId === row.builtByPlayerId) {
			await tx
				.update(schema.cityBuilding)
				.set({ state: "complete" })
				.where(eq(schema.cityBuilding.id, row.id));
			matured.push({
				id: row.id,
				cityId: row.cityId,
				playerId: row.builtByPlayerId,
				type: row.type,
			});
		} else {
			// City defected before the build matured — forfeit, no refund.
			await tx
				.update(schema.cityBuilding)
				.set({ state: "cancelled", completesAtTick: null })
				.where(eq(schema.cityBuilding.id, row.id));
		}
	}

	// Sum yields across complete buildings on still-owned host cities.
	const completeRows = await tx
		.select({
			type: schema.cityBuilding.type,
			builtByPlayerId: schema.cityBuilding.builtByPlayerId,
			ownerPlayerId: schema.cityState.ownerPlayerId,
		})
		.from(schema.cityBuilding)
		.innerJoin(
			schema.cityState,
			and(
				eq(schema.cityState.gameId, schema.cityBuilding.gameId),
				eq(schema.cityState.cityId, schema.cityBuilding.cityId),
			),
		)
		.where(and(eq(schema.cityBuilding.gameId, gameId), eq(schema.cityBuilding.state, "complete")));

	const yieldByPlayer = aggregateBuildingYields(completeRows);

	return { matured, yieldByPlayer };
}

export const _BUILDINGS_CATALOG_FOR_TESTS = BUILDINGS_CATALOG;
