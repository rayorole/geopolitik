import { newId, schema } from "@geopolitik/db";
import {
	type GameSnapshot,
	type GameSummary,
	createGameResponse,
	gameSnapshot,
	gameSummary,
	joinGameBody,
	submitOrderResponse,
} from "@geopolitik/shared/api";
import { submitOrderBodyV3 } from "@geopolitik/shared/orders";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { auth } from "./auth";
import { generateGameCode, isValidGameCode } from "./code";
import { pickFactionColor } from "./colors";
import { db } from "./db";
import { logger } from "./logger";
import { rateLimit } from "./rate-limit";

type AuthVars = { userId: string; userName: string };

async function requireAuth(req: Request): Promise<AuthVars | Response> {
	const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
	if (!session) return new Response("Unauthorized", { status: 401 });
	return { userId: session.user.id, userName: session.user.name };
}

function ipOf(req: Request): string {
	return (
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		req.headers.get("x-real-ip") ??
		"unknown"
	);
}

export function createGamesRouter() {
	const games = new Hono();

	// ── POST /games ───────────────────────────────────────────────────────────
	// No auth at Phase 2 (admin gating before any public exposure).
	// Rate-limit 5/min/IP.
	games.post("/games", async (c) => {
		const ip = ipOf(c.req.raw);
		const limit = await rateLimit({ key: `rl:create-game:${ip}`, max: 5, windowSeconds: 60 });
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
			await tx.insert(schema.nationState).values({
				gameId,
				playerId,
				money: 0,
				oil: 0,
				steel: 0,
				electronics: 0,
				population: 0,
			});

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
