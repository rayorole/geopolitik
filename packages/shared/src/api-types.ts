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
	unrest: z.number().int().min(0).max(100),
	inRevoltSinceTick: z.number().int().nonnegative().nullable(),
});

export const nationInSnapshot = z.object({
	playerId: z.string().uuid(),
	money: z.number().int(),
	oil: z.number().int().nonnegative(),
	steel: z.number().int().nonnegative(),
	electronics: z.number().int(),
	population: z.number().int().nonnegative(),
	taxation: z.number().int().min(0).max(100),
	welfare: z.number().int().min(0).max(100),
	healthcare: z.number().int().min(0).max(100),
	propaganda: z.number().int().min(0).max(100),
});

export const myOrder = z.object({
	id: z.string().uuid(),
	kind: z.enum(["noop", "build", "cancel_build", "set_slider"]),
	payload: z.unknown(),
	status: z.enum(["queued", "processing", "resolved", "cancelled", "expired"]),
	createdAt: z.string(),
	resolvedTick: z.number().int().nullable(),
});

export const cityBuildingInSnapshot = z.object({
	id: z.string().uuid(),
	cityId: z.string().uuid(),
	type: z.string(),
	state: z.enum(["in_progress", "complete", "cancelled"]),
	startedAtTick: z.number().int().nonnegative(),
	completesAtTick: z.number().int().nonnegative().nullable(),
	builtByPlayerId: z.string().uuid(),
});
export type CityBuildingInSnapshot = z.infer<typeof cityBuildingInSnapshot>;

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
	cityBuildings: z.array(cityBuildingInSnapshot),
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

// ── Your active matches ──────────────────────────────────────────────────────

export const mineGameSummary = z.object({
	gameId: z.string().uuid(),
	code: z.string().length(8),
	status: z.enum(["active", "quarantined", "ended"]),
	tick: z.number().int().nonnegative(),
	lastTickAt: z.string(),
	country: z.object({
		code: z.string().length(3),
		name: z.string(),
	}),
	color: z.string(),
	playerCount: z.number().int().nonnegative(),
	topUnrestCity: z
		.object({
			id: z.string().uuid(),
			name: z.string(),
			unrest: z.number().int().min(0).max(100),
			inRevolt: z.boolean(),
		})
		.nullable(),
});

export type MineGameSummary = z.infer<typeof mineGameSummary>;

// ── Research (Phase 4) ───────────────────────────────────────────────────────

export const researchUnlockRow = z.object({
	nodeId: z.string(),
	unlockedAtTick: z.number().int().nonnegative(),
	viaProjectId: z.string().uuid().nullable(),
});

export type ResearchUnlockRow = z.infer<typeof researchUnlockRow>;

export const researchProjectRow = z.object({
	id: z.string().uuid(),
	nodeId: z.string(),
	status: z.enum(["in_progress", "completed", "cancelled"]),
	startedAtTick: z.number().int().nonnegative(),
	expectedCompletionTick: z.number().int().nonnegative(),
	resolvedAtTick: z.number().int().nonnegative().nullable(),
});

export type ResearchProjectRow = z.infer<typeof researchProjectRow>;

export const playerResearchResponse = z.object({
	gameId: z.string().uuid(),
	playerId: z.string().uuid(),
	faction: z.enum(["nato_eu", "us", "china", "russia"]),
	unlocks: z.array(researchUnlockRow),
	activeProjects: z.array(researchProjectRow),
});

export type PlayerResearchResponse = z.infer<typeof playerResearchResponse>;

// ── Account profile ──────────────────────────────────────────────────────────

export const updateProfileBody = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name must not be empty")
		.max(32, "Name must be 32 characters or fewer"),
});

export type UpdateProfileBody = z.infer<typeof updateProfileBody>;

export const updateProfileResponse = z.object({
	user: z.object({
		id: z.string().uuid(),
		name: z.string(),
	}),
});

export type UpdateProfileResponse = z.infer<typeof updateProfileResponse>;
