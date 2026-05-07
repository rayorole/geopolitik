import { newId, schema } from "@geopolitik/db";
import {
	type GameSnapshot,
	type GameSummary,
	type MineGameSummary,
	type PlayerResearchResponse,
	createGameResponse,
	gameSnapshot,
	gameSummary,
	joinGameBody,
	mineGameSummary,
	playerResearchResponse,
	submitOrderResponse,
} from "@geopolitik/shared/api";
import { factionForCountry } from "@geopolitik/shared/factions";
import { submitOrderBodyV3 } from "@geopolitik/shared/orders";
import { tier0NodeIdsForFaction } from "@geopolitik/shared/research";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth } from "./auth-helper";
import { applyBuildOrder, applyCancelBuildOrder } from "./buildings";
import { generateGameCode, isValidGameCode } from "./code";
import { pickFactionColor } from "./colors";
import { db } from "./db";
import { logger } from "./logger";
import { rateLimit } from "./rate-limit";
import { applyCancelResearch, applyStartResearch } from "./research-orders";
import { getStartingResources } from "./tick-formula";

export function createGamesRouter() {
	const games = new Hono();

	// ── POST /games ───────────────────────────────────────────────────────────
	// Authed once the lobby surface goes public. Rate-limit per user (5/hr) —
	// per-IP would punish shared egress (offices, universities, mobile NAT).
	games.post("/games", async (c) => {
		const authResult = await requireAuth(c.req.raw);
		if (authResult instanceof Response) return authResult;
		const { userId } = authResult;

		const limit = await rateLimit({
			key: `rl:create-game:${userId}`,
			max: 5,
			windowSeconds: 3600,
		});
		if (!limit.ok) return c.json({ error: "rate_limited" }, 429);

		// Generate a unique code with retry on collision (extremely rare at 31^8).
		let code = generateGameCode();
		for (let attempt = 0; attempt < 5; attempt++) {
			const existing = await db
				.select({ id: schema.game.id })
				.from(schema.game)
				.where(eq(schema.game.code, code))
				.limit(1);
			if (existing.length === 0) break;
			code = generateGameCode();
		}

		const id = newId();
		await db.insert(schema.game).values({ id, code, status: "active", tick: 0 });

		const body: { id: string; code: string } = { id, code };
		return c.json(createGameResponse.parse(body), 201);
	});

	// ── GET /games ────────────────────────────────────────────────────────────
	// Browse: lists active games with at least one unclaimed country.
	games.get("/games", async (c) => {
		const rows = await db
			.select({
				id: schema.game.id,
				code: schema.game.code,
				status: schema.game.status,
				tick: schema.game.tick,
				createdAt: schema.game.createdAt,
				playerCount: sql<number>`(SELECT COUNT(*)::int FROM "player" WHERE "player"."game_id" = "game"."id")`,
				totalCountries: sql<number>`(SELECT COUNT(*)::int FROM "country")`,
			})
			.from(schema.game)
			.where(eq(schema.game.status, "active"))
			.orderBy(schema.game.createdAt);

		const result: GameSummary[] = rows
			.filter((r) => r.playerCount < r.totalCountries)
			.map((r) =>
				gameSummary.parse({
					id: r.id,
					code: r.code,
					status: r.status,
					tick: r.tick,
					playerCount: r.playerCount,
					unclaimedCountryCount: r.totalCountries - r.playerCount,
					createdAt: r.createdAt.toISOString(),
				}),
			);
		return c.json(result);
	});

	// ── GET /games/mine ───────────────────────────────────────────────────────
	// Active matches the authed user is a player in. Returns country, color,
	// player count, and the highest-unrest city the user owns per game so the
	// "Your matches" section can show "X is on fire" at a glance.
	games.get("/games/mine", async (c) => {
		const authResult = await requireAuth(c.req.raw);
		if (authResult instanceof Response) return authResult;
		const { userId } = authResult;

		const playerGameRows = await db
			.select({
				gameId: schema.game.id,
				code: schema.game.code,
				status: schema.game.status,
				tick: schema.game.tick,
				updatedAt: schema.game.updatedAt,
				playerId: schema.player.id,
				countryCode: schema.player.countryCode,
				countryName: schema.country.name,
				color: schema.player.color,
			})
			.from(schema.player)
			.innerJoin(schema.game, eq(schema.game.id, schema.player.gameId))
			.innerJoin(schema.country, eq(schema.country.code, schema.player.countryCode))
			.where(eq(schema.player.userId, userId))
			.orderBy(desc(schema.game.updatedAt));

		if (playerGameRows.length === 0) return c.json([] as MineGameSummary[]);

		const gameIds = playerGameRows.map((r) => r.gameId);
		const playerIds = playerGameRows.map((r) => r.playerId);

		const counts = await db
			.select({
				gameId: schema.player.gameId,
				n: sql<number>`COUNT(*)::int`,
			})
			.from(schema.player)
			.where(inArray(schema.player.gameId, gameIds))
			.groupBy(schema.player.gameId);
		const countMap = new Map(counts.map((c) => [c.gameId, c.n]));

		const cityRows = await db
			.select({
				ownerPlayerId: schema.cityState.ownerPlayerId,
				cityId: schema.cityState.cityId,
				cityName: schema.city.name,
				unrest: schema.cityState.unrest,
				inRevoltSinceTick: schema.cityState.inRevoltSinceTick,
			})
			.from(schema.cityState)
			.innerJoin(schema.city, eq(schema.city.id, schema.cityState.cityId))
			.where(
				and(
					inArray(schema.cityState.gameId, gameIds),
					inArray(schema.cityState.ownerPlayerId, playerIds),
				),
			);

		// Pick the worst-unrest city per player.
		const topByPlayer = new Map<string, (typeof cityRows)[number]>();
		for (const row of cityRows) {
			if (!row.ownerPlayerId) continue;
			const cur = topByPlayer.get(row.ownerPlayerId);
			if (!cur || row.unrest > cur.unrest) topByPlayer.set(row.ownerPlayerId, row);
		}

		const result: MineGameSummary[] = playerGameRows.map((r) => {
			const top = topByPlayer.get(r.playerId);
			return mineGameSummary.parse({
				gameId: r.gameId,
				code: r.code,
				status: r.status,
				tick: r.tick,
				lastTickAt: r.updatedAt.toISOString(),
				country: { code: r.countryCode, name: r.countryName },
				color: r.color,
				playerCount: countMap.get(r.gameId) ?? 0,
				topUnrestCity: top
					? {
							id: top.cityId,
							name: top.cityName,
							unrest: top.unrest,
							inRevolt: top.inRevoltSinceTick !== null,
						}
					: null,
			});
		});

		return c.json(result);
	});

	// ── GET /games/by-code/:code ──────────────────────────────────────────────
	games.get("/games/by-code/:code", async (c) => {
		const code = c.req.param("code").toUpperCase();
		if (!isValidGameCode(code)) return c.json({ error: "invalid_code" }, 400);
		const rows = await db
			.select({
				id: schema.game.id,
				code: schema.game.code,
				status: schema.game.status,
				tick: schema.game.tick,
				createdAt: schema.game.createdAt,
			})
			.from(schema.game)
			.where(eq(schema.game.code, code))
			.limit(1);
		const row = rows[0];
		if (!row) return c.json({ error: "not_found" }, 404);

		const playerCountRows = await db
			.select({ n: sql<number>`COUNT(*)::int` })
			.from(schema.player)
			.where(eq(schema.player.gameId, row.id));
		const totalCountryRows = await db
			.select({ n: sql<number>`COUNT(*)::int` })
			.from(schema.country);
		const playerCount = playerCountRows[0]?.n ?? 0;
		const totalCountries = totalCountryRows[0]?.n ?? 0;

		return c.json(
			gameSummary.parse({
				id: row.id,
				code: row.code,
				status: row.status,
				tick: row.tick,
				playerCount,
				unclaimedCountryCount: totalCountries - playerCount,
				createdAt: row.createdAt.toISOString(),
			}),
		);
	});

	// ── POST /games/:id/join ──────────────────────────────────────────────────
	games.post("/games/:id/join", async (c) => {
		const authResult = await requireAuth(c.req.raw);
		if (authResult instanceof Response) return authResult;
		const { userId, userName } = authResult;

		const gameId = c.req.param("id");
		const parsed = joinGameBody.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
		const { countryCode } = parsed.data;

		const result = await db.transaction(async (tx) => {
			const [g] = await tx
				.select()
				.from(schema.game)
				.where(eq(schema.game.id, gameId))
				.for("update")
				.limit(1);
			if (!g) return { kind: "not-found" as const };
			if (g.status !== "active") return { kind: "not-joinable" as const };

			const [country] = await tx
				.select()
				.from(schema.country)
				.where(eq(schema.country.code, countryCode))
				.limit(1);
			if (!country) return { kind: "invalid-country" as const };

			const existing = await tx
				.select()
				.from(schema.player)
				.where(eq(schema.player.gameId, gameId));
			if (existing.some((p) => p.userId === userId))
				return {
					kind: "already-joined" as const,
					playerId: existing.find((p) => p.userId === userId)?.id,
				};
			if (existing.some((p) => p.countryCode === countryCode))
				return { kind: "country-taken" as const };

			const playerId = newId();
			const color = pickFactionColor(existing.map((p) => p.color));

			await tx.insert(schema.player).values({
				id: playerId,
				gameId,
				userId,
				countryCode,
				color,
			});
			const starting = getStartingResources();
			await tx.insert(schema.nationState).values({
				gameId,
				playerId,
				money: starting.money,
				oil: starting.oil,
				steel: starting.steel,
				electronics: starting.electronics,
				population: 0,
			});

			// Phase 4: tier-0 starter pack — seed research_unlock rows for every
			// tier-0 node in the joining player's faction. via_project_id is null
			// to flag these as starter unlocks, not researched. Idempotent on
			// rejoin via onConflictDoNothing on the (game, player, node) PK.
			const faction = factionForCountry(countryCode);
			if (!faction) {
				// Should be unreachable: factions.json covers every country in
				// world-data (asserted by validator unit test). Defensive guard.
				throw new Error(`country ${countryCode} has no faction mapping`);
			}
			const tier0Ids = tier0NodeIdsForFaction(faction);
			if (tier0Ids.length > 0) {
				await tx
					.insert(schema.researchUnlock)
					.values(
						tier0Ids.map((nodeId) => ({
							gameId,
							playerId,
							nodeId,
							unlockedAtTick: g.tick,
							viaProjectId: null,
						})),
					)
					.onConflictDoNothing();
			}

			// Initial city ownership: every city tagged with this country code
			// becomes owned by the new player. city_state rows get inserted on
			// first ownership; population starts at base_population.
			const cities = await tx
				.select({ id: schema.city.id, basePopulation: schema.city.basePopulation })
				.from(schema.city)
				.where(eq(schema.city.countryCode, countryCode));

			if (cities.length > 0) {
				await tx
					.insert(schema.cityState)
					.values(
						cities.map((cy) => ({
							gameId,
							cityId: cy.id,
							ownerPlayerId: playerId,
							population: cy.basePopulation,
						})),
					)
					.onConflictDoUpdate({
						target: [schema.cityState.gameId, schema.cityState.cityId],
						set: { ownerPlayerId: playerId },
					});

				const totalPop = cities.reduce((sum, cy) => sum + cy.basePopulation, 0);
				await tx
					.update(schema.nationState)
					.set({ population: totalPop })
					.where(
						and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, playerId)),
					);
			}

			return { kind: "joined" as const, playerId, color };
		});

		switch (result.kind) {
			case "not-found":
				return c.json({ error: "not_found" }, 404);
			case "not-joinable":
				return c.json({ error: "game_not_joinable" }, 409);
			case "invalid-country":
				return c.json({ error: "invalid_country" }, 400);
			case "country-taken":
				return c.json({ error: "country_taken" }, 409);
			case "already-joined":
				return c.json({ playerId: result.playerId, alreadyJoined: true });
			case "joined":
				logger.info(
					{ gameId, userId, userName, countryCode, playerId: result.playerId },
					"game.join",
				);
				return c.json({ playerId: result.playerId, color: result.color }, 201);
		}
	});

	// ── POST /games/:id/leave ─────────────────────────────────────────────────
	games.post("/games/:id/leave", async (c) => {
		const authResult = await requireAuth(c.req.raw);
		if (authResult instanceof Response) return authResult;
		const { userId } = authResult;

		const gameId = c.req.param("id");

		await db.transaction(async (tx) => {
			const [me] = await tx
				.select()
				.from(schema.player)
				.where(and(eq(schema.player.gameId, gameId), eq(schema.player.userId, userId)))
				.limit(1);
			if (!me) return;

			// Unassign cities owned by this player (set null instead of cascade)
			await tx
				.update(schema.cityState)
				.set({ ownerPlayerId: null })
				.where(and(eq(schema.cityState.gameId, gameId), eq(schema.cityState.ownerPlayerId, me.id)));
			// Cascade deletes player + nation_state via FK
			await tx.delete(schema.player).where(eq(schema.player.id, me.id));
		});

		return c.json({ ok: true });
	});

	// ── GET /games/:id/snapshot ───────────────────────────────────────────────
	games.get("/games/:id/snapshot", async (c) => {
		const authResult = await requireAuth(c.req.raw);
		if (authResult instanceof Response) return authResult;
		const { userId } = authResult;

		const gameId = c.req.param("id");

		const [g] = await db.select().from(schema.game).where(eq(schema.game.id, gameId)).limit(1);
		if (!g) return c.json({ error: "not_found" }, 404);

		const players = await db
			.select({
				id: schema.player.id,
				userId: schema.player.userId,
				countryCode: schema.player.countryCode,
				color: schema.player.color,
				userName: schema.user.name,
			})
			.from(schema.player)
			.leftJoin(schema.user, eq(schema.user.id, schema.player.userId))
			.where(eq(schema.player.gameId, gameId));

		const me = players.find((p) => p.userId === userId);

		const cityState = await db
			.select({
				cityId: schema.cityState.cityId,
				ownerPlayerId: schema.cityState.ownerPlayerId,
				population: schema.cityState.population,
				unrest: schema.cityState.unrest,
				inRevoltSinceTick: schema.cityState.inRevoltSinceTick,
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
				taxation: schema.nationState.taxation,
				welfare: schema.nationState.welfare,
				healthcare: schema.nationState.healthcare,
				propaganda: schema.nationState.propaganda,
				researchSlotMax: schema.nationState.researchSlotMax,
				unlockedSystems: schema.nationState.unlockedSystems,
			})
			.from(schema.nationState)
			.where(eq(schema.nationState.gameId, gameId));

		const myOrders = me
			? await db
					.select()
					.from(schema.order)
					.where(
						and(
							eq(schema.order.gameId, gameId),
							eq(schema.order.playerId, me.id),
							inArray(schema.order.status, ["queued", "processing"]),
						),
					)
			: [];

		// Phase 3d: include the player's own buildings — everything they built,
		// regardless of current owner of the host city. Foreign infra hidden
		// per Q6g; we just don't return it.
		const cityBuildings = me
			? await db
					.select({
						id: schema.cityBuilding.id,
						cityId: schema.cityBuilding.cityId,
						type: schema.cityBuilding.type,
						state: schema.cityBuilding.state,
						startedAtTick: schema.cityBuilding.startedAtTick,
						completesAtTick: schema.cityBuilding.completesAtTick,
						builtByPlayerId: schema.cityBuilding.builtByPlayerId,
					})
					.from(schema.cityBuilding)
					.where(
						and(
							eq(schema.cityBuilding.gameId, gameId),
							eq(schema.cityBuilding.builtByPlayerId, me.id),
							inArray(schema.cityBuilding.state, ["in_progress", "complete"]),
						),
					)
			: [];

		const snapshot: GameSnapshot = {
			game: {
				id: g.id,
				code: g.code,
				status: g.status,
				tick: g.tick,
				createdAt: g.createdAt.toISOString(),
			},
			players: players.map((p) => ({
				id: p.id,
				displayName: p.userName ?? "Unknown",
				countryCode: p.countryCode,
				color: p.color,
			})),
			cityState,
			nationState,
			cityBuildings,
			myOrders: myOrders.map((o) => ({
				id: o.id,
				kind: o.kind,
				payload: o.payload,
				status: o.status,
				createdAt: o.createdAt.toISOString(),
				resolvedTick: o.resolvedTick,
			})),
			mePlayerId: me?.id ?? null,
		};

		return c.json(gameSnapshot.parse(snapshot));
	});

	// ── GET /games/:id/research ───────────────────────────────────────────────
	// Phase 4b: returns the player's research_unlocks (tier 0 + later
	// unlocked tiers) and any in-progress research_projects. Auth required;
	// 403 if the caller isn't a player in this game. Active projects are
	// always [] in 4b — the order kinds land in 4c.
	games.get("/games/:id/research", async (c) => {
		const authResult = await requireAuth(c.req.raw);
		if (authResult instanceof Response) return authResult;
		const { userId } = authResult;

		const gameId = c.req.param("id");

		const [me] = await db
			.select({
				id: schema.player.id,
				countryCode: schema.player.countryCode,
			})
			.from(schema.player)
			.where(and(eq(schema.player.gameId, gameId), eq(schema.player.userId, userId)))
			.limit(1);
		if (!me) return c.json({ error: "not_a_player" }, 403);

		const faction = factionForCountry(me.countryCode);
		if (!faction) {
			return c.json({ error: "country_has_no_faction" }, 500);
		}

		const unlocks = await db
			.select({
				nodeId: schema.researchUnlock.nodeId,
				unlockedAtTick: schema.researchUnlock.unlockedAtTick,
				viaProjectId: schema.researchUnlock.viaProjectId,
			})
			.from(schema.researchUnlock)
			.where(
				and(eq(schema.researchUnlock.gameId, gameId), eq(schema.researchUnlock.playerId, me.id)),
			);

		const activeProjects = await db
			.select({
				id: schema.researchProject.id,
				nodeId: schema.researchProject.nodeId,
				status: schema.researchProject.status,
				startedAtTick: schema.researchProject.startedAtTick,
				expectedCompletionTick: schema.researchProject.expectedCompletionTick,
				resolvedAtTick: schema.researchProject.resolvedAtTick,
			})
			.from(schema.researchProject)
			.where(
				and(
					eq(schema.researchProject.gameId, gameId),
					eq(schema.researchProject.playerId, me.id),
					eq(schema.researchProject.status, "in_progress"),
				),
			);

		const response: PlayerResearchResponse = {
			gameId,
			playerId: me.id,
			faction,
			unlocks,
			activeProjects,
		};
		return c.json(playerResearchResponse.parse(response));
	});

	// ── POST /games/:id/orders ────────────────────────────────────────────────
	games.post("/games/:id/orders", async (c) => {
		const authResult = await requireAuth(c.req.raw);
		if (authResult instanceof Response) return authResult;
		const { userId } = authResult;

		const gameId = c.req.param("id");
		const parsed = submitOrderBodyV3.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: "invalid_body" }, 400);

		const [me] = await db
			.select()
			.from(schema.player)
			.where(and(eq(schema.player.gameId, gameId), eq(schema.player.userId, userId)))
			.limit(1);
		if (!me) return c.json({ error: "not_a_player" }, 403);

		const limit = await rateLimit({
			key: `rl:orders:${me.id}`,
			max: 60,
			windowSeconds: 60,
		});
		if (!limit.ok) return c.json({ error: "rate_limited" }, 429);

		const orderId = newId();

		// build / cancel_build / start_research / cancel_research apply at REST
		// time under the per-game lock so the client gets a synchronous
		// accept/reject and the persisted row is the single source of truth from
		// the moment of acceptance. noop and set_slider continue to defer work
		// to the tick worker.
		const RESOLVE_AT_REST = ["build", "cancel_build", "start_research", "cancel_research"] as const;
		if ((RESOLVE_AT_REST as readonly string[]).includes(parsed.data.kind)) {
			const txResult = await db.transaction(async (tx) => {
				const [g] = await tx
					.select({ tick: schema.game.tick, status: schema.game.status })
					.from(schema.game)
					.where(eq(schema.game.id, gameId))
					.for("update")
					.limit(1);
				if (!g) return { http: 404 as const, body: { error: "game_not_found" } };
				if (g.status !== "active") return { http: 409 as const, body: { error: "game_inactive" } };

				if (parsed.data.kind === "build") {
					const r = await applyBuildOrder(tx, gameId, me.id, g.tick, parsed.data.payload);
					if (!r.ok) return { http: 400 as const, body: { error: r.reason } };
				} else if (parsed.data.kind === "cancel_build") {
					const r = await applyCancelBuildOrder(tx, gameId, me.id, parsed.data.payload);
					if (!r.ok) return { http: 400 as const, body: { error: r.reason } };
				} else if (parsed.data.kind === "start_research") {
					const r = await applyStartResearch(tx, gameId, me.id, g.tick, parsed.data.payload);
					if (!r.ok) return { http: 400 as const, body: { error: r.reason } };
				} else if (parsed.data.kind === "cancel_research") {
					const r = await applyCancelResearch(tx, gameId, me.id, g.tick, parsed.data.payload);
					if (!r.ok) return { http: 400 as const, body: { error: r.reason } };
				}

				await tx.insert(schema.order).values({
					id: orderId,
					gameId,
					playerId: me.id,
					kind: parsed.data.kind,
					payload: parsed.data.payload,
					status: "resolved",
					resolvedTick: g.tick,
					resolvedAt: new Date(),
					expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
				});
				return { http: 201 as const, body: null };
			});
			if (txResult.http !== 201) {
				return c.json(txResult.body, txResult.http);
			}
			return c.json(submitOrderResponse.parse({ orderId, status: "queued" }), 201);
		}

		await db.insert(schema.order).values({
			id: orderId,
			gameId,
			playerId: me.id,
			kind: parsed.data.kind,
			payload: parsed.data.payload ?? {},
			status: "queued",
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		});

		return c.json(submitOrderResponse.parse({ orderId, status: "queued" }), 201);
	});

	// ── DELETE /games/:id/orders/:orderId ─────────────────────────────────────
	games.delete("/games/:id/orders/:orderId", async (c) => {
		const authResult = await requireAuth(c.req.raw);
		if (authResult instanceof Response) return authResult;
		const { userId } = authResult;

		const gameId = c.req.param("id");
		const orderId = c.req.param("orderId");

		const result = await db.transaction(async (tx) => {
			const [me] = await tx
				.select()
				.from(schema.player)
				.where(and(eq(schema.player.gameId, gameId), eq(schema.player.userId, userId)))
				.limit(1);
			if (!me) return { kind: "not-a-player" as const };

			const [o] = await tx.select().from(schema.order).where(eq(schema.order.id, orderId)).limit(1);
			if (!o) return { kind: "not-found" as const };
			if (o.playerId !== me.id) return { kind: "forbidden" as const };
			if (o.status !== "queued") return { kind: "not-cancellable" as const };

			await tx
				.update(schema.order)
				.set({ status: "cancelled" })
				.where(eq(schema.order.id, orderId));
			return { kind: "cancelled" as const };
		});

		switch (result.kind) {
			case "not-a-player":
				return c.json({ error: "not_a_player" }, 403);
			case "not-found":
				return c.json({ error: "not_found" }, 404);
			case "forbidden":
				return c.json({ error: "forbidden" }, 403);
			case "not-cancellable":
				return c.json({ error: "not_cancellable" }, 409);
			case "cancelled":
				return c.json({ ok: true });
		}
	});

	return games;
}
