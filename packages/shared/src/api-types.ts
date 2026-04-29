import { z } from "zod";

/*
 * REST request/response shapes for Phase 2 game lifecycle.
 * Imported by both `apps/api` (Hono validators) and `apps/web` (TanStack Query).
 */

// ── Game shape ───────────────────────────────────────────────────────────────

export const gameSummary = z.object({
	id: z.string().uuid(),
	code: z.string().length(8),
	status: z.enum(["active", "quarantined", "ended"]),
	tick: z.number().int().nonnegative(),
	playerCount: z.number().int().nonnegative(),
	unclaimedCountryCount: z.number().int().nonnegative(),
	createdAt: z.string(),
});

export type GameSummary = z.infer<typeof gameSummary>;

export const playerInGame = z.object({
	id: z.string().uuid(),
	displayName: z.string(),
	countryCode: z.string().length(3),
	color: z.string(),
});

export type PlayerInGame = z.infer<typeof playerInGame>;

export const cityInSnapshot = z.object({
	cityId: z.string().uuid(),
	ownerPlayerId: z.string().uuid().nullable(),
	population: z.number().int().nonnegative(),
});

export const nationInSnapshot = z.object({
	playerId: z.string().uuid(),
	money: z.number().int().nonnegative(),
	oil: z.number().int().nonnegative(),
	steel: z.number().int().nonnegative(),
	electronics: z.number().int().nonnegative(),
	population: z.number().int().nonnegative(),
});

export const myOrder = z.object({
	id: z.string().uuid(),
	kind: z.enum(["noop", "build", "cancel_build", "set_slider"]),
	payload: z.unknown(),
	status: z.enum(["queued", "processing", "resolved", "cancelled", "expired"]),
	createdAt: z.string(),
	resolvedTick: z.number().int().nullable(),
});

export const gameSnapshot = z.object({
	game: z.object({
		id: z.string().uuid(),
		code: z.string().length(8),
		status: z.enum(["active", "quarantined", "ended"]),
		tick: z.number().int().nonnegative(),
		createdAt: z.string(),
	}),
	players: z.array(playerInGame),
	cityState: z.array(cityInSnapshot),
	nationState: z.array(nationInSnapshot),
	myOrders: z.array(myOrder),
	mePlayerId: z.string().uuid().nullable(),
});

export type GameSnapshot = z.infer<typeof gameSnapshot>;

// ── World cities (long-cached static) ────────────────────────────────────────

export const worldCity = z.object({
	id: z.string().uuid(),
	countryCode: z.string().length(3),
	name: z.string(),
	lat: z.number(),
	lng: z.number(),
	basePopulation: z.number().int().nonnegative(),
	isCapital: z.boolean(),
	moneyMult: z.number(),
	steelMult: z.number(),
	electronicsMult: z.number(),
	oilMult: z.number(),
});

export const worldCountry = z.object({
	code: z.string().length(3),
	name: z.string(),
});

export const worldDataset = z.object({
	countries: z.array(worldCountry),
	cities: z.array(worldCity),
});

export type WorldDataset = z.infer<typeof worldDataset>;

// ── REST request bodies ──────────────────────────────────────────────────────

export const joinGameBody = z.object({
	countryCode: z.string().length(3),
});

export const submitOrderBody = z.object({
	kind: z.literal("noop"),
	payload: z.unknown().optional(),
});

export type JoinGameBody = z.infer<typeof joinGameBody>;
export type SubmitOrderBody = z.infer<typeof submitOrderBody>;

// ── REST response bodies ─────────────────────────────────────────────────────

export const createGameResponse = z.object({
	id: z.string().uuid(),
	code: z.string().length(8),
});

export type CreateGameResponse = z.infer<typeof createGameResponse>;

export const submitOrderResponse = z.object({
	orderId: z.string().uuid(),
	status: z.enum(["queued"]),
});

export type SubmitOrderResponse = z.infer<typeof submitOrderResponse>;
