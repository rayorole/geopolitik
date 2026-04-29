/*
 * Tick worker — Phase 2.
 *
 * Drives the per-game game loop: every TICK_INTERVAL_MS the loop iterates all
 * active games, claims one with FOR UPDATE, drains the order queue, applies
 * the production formula, advances city populations, increments the tick
 * counter, commits, and broadcasts the new state on the WS topics.
 *
 * Idempotency: tick_log has UNIQUE(game_id, tick_number); a duplicate tick
 * attempt aborts at INSERT.
 *
 * Errors: any exception inside the transaction rolls back the whole tick.
 * Retry once; on second failure mark the game `quarantined` so it stops
 * ticking until manual review.
 */

import { newId, schema } from "@geopolitik/db";
import { type WsOutboundTick, gameTopic, playerTopic } from "@geopolitik/shared";
import { submitOrderBodyV3 } from "@geopolitik/shared/orders";
import { SLIDER_NAMES } from "@geopolitik/shared/policy";
import { and, eq, sql } from "drizzle-orm";
import { type MaturationOutcome, matureBuildingsAndComputeYields } from "./buildings";
import { db } from "./db";
import { logger } from "./logger";
import {
	type ResourceDelta,
	type SliderState,
	applyProductionToCity,
	applySliderEconomics,
} from "./tick-formula";

type Publish = (topic: string, msg: string) => number;

export { applyProductionToCity, growCityPopulation } from "./tick-formula";
export type { CityProductionInput, ResourceDelta } from "./tick-formula";

let publish: Publish | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export function setPublisher(p: Publish): void {
	publish = p;
}

export function startTickLoop(intervalMs: number): void {
	if (timer) return;
	logger.info({ intervalMs }, "tick.loop.start");
	timer = setInterval(() => {
		tickAllActiveGames().catch((err) => logger.error({ err }, "tick.loop.error"));
	}, intervalMs);
}

export function stopTickLoop(): void {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
}

async function tickAllActiveGames(): Promise<void> {
	const games = await db
		.select({ id: schema.game.id })
		.from(schema.game)
		.where(eq(schema.game.status, "active"));
	for (const g of games) {
		await runTickWithRetry(g.id);
	}
}

async function runTickWithRetry(gameId: string): Promise<void> {
	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			await runTick(gameId);
			return;
		} catch (err) {
			logger.error({ err, gameId, attempt }, "tick.error");
		}
	}
	await db.update(schema.game).set({ status: "quarantined" }).where(eq(schema.game.id, gameId));
	logger.error({ gameId }, "tick.quarantined");
}

// ── Tick (transactional) ─────────────────────────────────────────────────────

type ResolvedOrder = { id: string; playerId: string };

export async function runTick(gameId: string): Promise<void> {
	const startMs = Date.now();
	let tickNumber = 0;
	const resolvedOrders: ResolvedOrder[] = [];
	let maturationOutcome: MaturationOutcome = { matured: [], yieldByPlayer: new Map() };

	await db.transaction(async (tx) => {
		const [g] = await tx
			.select()
			.from(schema.game)
			.where(eq(schema.game.id, gameId))
			.for("update")
			.limit(1);
		if (!g || g.status !== "active") return;

		tickNumber = g.tick + 1;

		// Claim the tick number — UNIQUE(game_id, tick_number) prevents replay.
		await tx.insert(schema.tickLog).values({
			id: newId(),
			gameId,
			tickNumber,
			retryCount: 0,
		});

		// Drain queued orders FIFO. Per CLAUDE.md the tick must revalidate every
		// order — never trust the client's belief about what's legal. Set-slider
		// orders are coalesced: only the latest value per (player, slider) wins.
		const queued = await tx
			.select()
			.from(schema.order)
			.where(and(eq(schema.order.gameId, gameId), eq(schema.order.status, "queued")));
		queued.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

		const sliderUpdates = new Map<string, Partial<SliderState>>();

		for (const o of queued) {
			if (o.kind === "set_slider") {
				const parsed = submitOrderBodyV3.safeParse({ kind: o.kind, payload: o.payload });
				if (parsed.success && parsed.data.kind === "set_slider") {
					const { slider, value } = parsed.data.payload;
					const existing = sliderUpdates.get(o.playerId) ?? {};
					existing[slider] = value;
					sliderUpdates.set(o.playerId, existing);
					await tx
						.update(schema.order)
						.set({ status: "resolved", resolvedTick: tickNumber, resolvedAt: new Date() })
						.where(eq(schema.order.id, o.id));
				} else {
					await tx
						.update(schema.order)
						.set({ status: "cancelled", resolvedTick: tickNumber, resolvedAt: new Date() })
						.where(eq(schema.order.id, o.id));
				}
				resolvedOrders.push({ id: o.id, playerId: o.playerId });
				continue;
			}

			// noop and other kinds: resolve as-is (build/cancel_build land in 3d).
			await tx
				.update(schema.order)
				.set({ status: "resolved", resolvedTick: tickNumber, resolvedAt: new Date() })
				.where(eq(schema.order.id, o.id));
			resolvedOrders.push({ id: o.id, playerId: o.playerId });
		}

		// Apply slider updates BEFORE production so this tick reflects them.
		for (const [playerId, patch] of sliderUpdates) {
			const set: Record<string, number | Date> = { updatedAt: new Date() };
			for (const name of SLIDER_NAMES) {
				if (patch[name] !== undefined) set[name] = patch[name] as number;
			}
			await tx
				.update(schema.nationState)
				.set(set)
				.where(
					and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, playerId)),
				);
		}

		// Mature any in_progress buildings whose completes_at_tick has elapsed
		// AND whose host city is still owned by the builder. Defected cities
		// forfeit pending builds. Yields aggregated across complete buildings
		// run THIS tick (a building completing on tick N produces on tick N).
		maturationOutcome = await matureBuildingsAndComputeYields(tx, gameId, tickNumber);

		// Load every nation's current slider state for this game. Used to drive
		// healthcare-scaled pop growth on each owned city and slider-economics
		// on each nation.
		const nations = await tx
			.select({
				playerId: schema.nationState.playerId,
				taxation: schema.nationState.taxation,
				welfare: schema.nationState.welfare,
				healthcare: schema.nationState.healthcare,
				propaganda: schema.nationState.propaganda,
			})
			.from(schema.nationState)
			.where(eq(schema.nationState.gameId, gameId));
		const slidersByPlayer = new Map<string, SliderState>();
		for (const n of nations) {
			slidersByPlayer.set(n.playerId, {
				taxation: n.taxation,
				welfare: n.welfare,
				healthcare: n.healthcare,
				propaganda: n.propaganda,
			});
		}

		// Pull every city + state row in one join, accumulate by player, write
		// back. This is the only DB-heavy section; for the 75-nation/750-city
		// fixture it's < 200 ms locally.
		const rows = await tx
			.select({
				cityId: schema.cityState.cityId,
				ownerPlayerId: schema.cityState.ownerPlayerId,
				population: schema.cityState.population,
				moneyMult: schema.city.moneyMult,
				steelMult: schema.city.steelMult,
				electronicsMult: schema.city.electronicsMult,
				oilMult: schema.city.oilMult,
			})
			.from(schema.cityState)
			.innerJoin(schema.city, eq(schema.city.id, schema.cityState.cityId))
			.where(eq(schema.cityState.gameId, gameId));

		type Acc = ResourceDelta & { population: number };
		const byPlayer = new Map<string, Acc>();

		for (const r of rows) {
			const sliders = r.ownerPlayerId ? slidersByPlayer.get(r.ownerPlayerId) : undefined;
			const result = applyProductionToCity({
				population: r.population,
				moneyMult: r.moneyMult,
				steelMult: r.steelMult,
				electronicsMult: r.electronicsMult,
				oilMult: r.oilMult,
				healthcare: sliders?.healthcare,
			});

			await tx
				.update(schema.cityState)
				.set({ population: result.newPopulation, updatedAt: new Date() })
				.where(and(eq(schema.cityState.gameId, gameId), eq(schema.cityState.cityId, r.cityId)));

			if (!r.ownerPlayerId) continue;
			const acc = byPlayer.get(r.ownerPlayerId) ?? {
				money: 0,
				oil: 0,
				steel: 0,
				electronics: 0,
				population: 0,
			};
			acc.money += result.resourceDelta.money;
			acc.oil += result.resourceDelta.oil;
			acc.steel += result.resourceDelta.steel;
			acc.electronics += result.resourceDelta.electronics;
			acc.population += result.newPopulation;
			byPlayer.set(r.ownerPlayerId, acc);
		}

		// Slider economics fold into the same per-player accumulator. Money can
		// go negative — nation_state.money is bigint with no non-negative check.
		for (const [playerId, sliders] of slidersByPlayer) {
			const acc = byPlayer.get(playerId) ?? {
				money: 0,
				oil: 0,
				steel: 0,
				electronics: 0,
				population: 0,
			};
			const sliderDelta = applySliderEconomics(sliders, acc.population);
			acc.money += sliderDelta.money;
			acc.electronics += sliderDelta.electronics;
			byPlayer.set(playerId, acc);
		}

		// Building yields fold in next. RP accumulates separately on nation_state.rp;
		// the existing accumulator only tracks the four base resources.
		const rpByPlayer = new Map<string, number>();
		for (const [playerId, y] of maturationOutcome.yieldByPlayer) {
			const acc = byPlayer.get(playerId) ?? {
				money: 0,
				oil: 0,
				steel: 0,
				electronics: 0,
				population: 0,
			};
			acc.money += y.money;
			acc.oil += y.oil;
			acc.steel += y.steel;
			acc.electronics += y.electronics;
			byPlayer.set(playerId, acc);
			if (y.rp > 0) rpByPlayer.set(playerId, (rpByPlayer.get(playerId) ?? 0) + y.rp);
		}

		for (const [playerId, acc] of byPlayer) {
			const rpDelta = rpByPlayer.get(playerId) ?? 0;
			await tx
				.update(schema.nationState)
				.set({
					money: sql`${schema.nationState.money} + ${acc.money}`,
					oil: sql`${schema.nationState.oil} + ${acc.oil}`,
					steel: sql`${schema.nationState.steel} + ${acc.steel}`,
					electronics: sql`${schema.nationState.electronics} + ${acc.electronics}`,
					rp: sql`${schema.nationState.rp} + ${rpDelta}`,
					population: acc.population,
					updatedAt: new Date(),
				})
				.where(
					and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, playerId)),
				);
		}

		await tx
			.update(schema.game)
			.set({ tick: tickNumber, updatedAt: new Date() })
			.where(eq(schema.game.id, gameId));

		const durationMs = Date.now() - startMs;
		await tx
			.update(schema.tickLog)
			.set({ completedAt: new Date(), durationMs })
			.where(and(eq(schema.tickLog.gameId, gameId), eq(schema.tickLog.tickNumber, tickNumber)));
		if (durationMs > 2000) {
			logger.warn({ gameId, tickNumber, durationMs }, "tick.slow");
		} else {
			logger.info({ gameId, tickNumber, durationMs }, "tick.ok");
		}
	});

	if (tickNumber === 0) return; // game wasn't active or didn't exist
	await broadcastTick(gameId, tickNumber, resolvedOrders, maturationOutcome);
}

async function broadcastTick(
	gameId: string,
	tickNumber: number,
	resolvedOrders: ResolvedOrder[],
	maturation: MaturationOutcome,
): Promise<void> {
	if (!publish) return;

	const cityState = await db
		.select({
			cityId: schema.cityState.cityId,
			ownerPlayerId: schema.cityState.ownerPlayerId,
			population: schema.cityState.population,
		})
		.from(schema.cityState)
		.where(eq(schema.cityState.gameId, gameId));

	const nationState = await db
		.select({
			playerId: schema.nationState.playerId,
			money: schema.nationState.money,
			oil: schema.nationState.oil,
			steel: schema.nationState.steel,
			electronics: schema.nationState.electronics,
			population: schema.nationState.population,
			rp: schema.nationState.rp,
			taxation: schema.nationState.taxation,
			welfare: schema.nationState.welfare,
			healthcare: schema.nationState.healthcare,
			propaganda: schema.nationState.propaganda,
		})
		.from(schema.nationState)
		.where(eq(schema.nationState.gameId, gameId));

	const tickMsg: WsOutboundTick = {
		type: "tick",
		gameId,
		tick: tickNumber,
		cityState,
		nationState,
	};
	publish(gameTopic(gameId), JSON.stringify(tickMsg));

	for (const o of resolvedOrders) {
		publish(
			playerTopic(o.playerId),
			JSON.stringify({ type: "order-resolved", orderId: o.id, tick: tickNumber }),
		);
	}

	for (const m of maturation.matured) {
		publish(
			playerTopic(m.playerId),
			JSON.stringify({
				type: "building_complete",
				cityId: m.cityId,
				buildingId: m.id,
				buildingType: m.type,
				tick: tickNumber,
			}),
		);
	}
}
