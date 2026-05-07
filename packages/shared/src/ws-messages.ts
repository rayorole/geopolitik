import { z } from "zod";

/*
 * WebSocket protocol — Phase 2.
 *
 * Inbound (client → server):
 *   - ping         heartbeat round-trip (Phase 0)
 *   - subscribe    join the topic for a game (Phase 2)
 *   - unsubscribe  leave the topic (Phase 2)
 *
 * Outbound (server → client):
 *   - pong              ping reply (Phase 0)
 *   - error             malformed or rejected inbound (Phase 0)
 *   - tick              per-tick broadcast on `game:<id>` topic (Phase 2)
 *   - ack | nack        order accepted / rejected on `player:<id>` (Phase 2)
 *   - order-resolved    order consumed by the tick on `player:<id>` (Phase 2)
 *   - desync            client must refetch snapshot (Phase 2)
 *
 * Server-authoritative: every inbound message is parsed before the server
 * trusts it. Outbound messages are typed but not parsed by clients; clients
 * trust the server.
 */

// ── Inbound ──────────────────────────────────────────────────────────────────

export const wsInboundPing = z.object({
	type: z.literal("ping"),
	nonce: z.string().min(1).max(64),
});

export const wsInboundSubscribe = z.object({
	type: z.literal("subscribe"),
	gameId: z.string().uuid(),
});

export const wsInboundUnsubscribe = z.object({
	type: z.literal("unsubscribe"),
	gameId: z.string().uuid(),
});

export const wsInboundMessage = z.discriminatedUnion("type", [
	wsInboundPing,
	wsInboundSubscribe,
	wsInboundUnsubscribe,
]);
export type WsInboundMessage = z.infer<typeof wsInboundMessage>;

// ── Outbound ─────────────────────────────────────────────────────────────────

export const wsOutboundPong = z.object({
	type: z.literal("pong"),
	nonce: z.string(),
	serverTime: z.number().int(),
});

export const wsOutboundError = z.object({
	type: z.literal("error"),
	code: z.string(),
	message: z.string(),
});

export const tickCityState = z.object({
	cityId: z.string().uuid(),
	ownerPlayerId: z.string().uuid().nullable(),
	population: z.number().int().nonnegative(),
	unrest: z.number().int().min(0).max(100),
	inRevoltSinceTick: z.number().int().nonnegative().nullable(),
});

export const tickNationState = z.object({
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
	researchSlotMax: z.number().int().positive(),
	unlockedSystems: z.array(z.string()),
});

export const wsOutboundTick = z.object({
	type: z.literal("tick"),
	gameId: z.string().uuid(),
	tick: z.number().int().nonnegative(),
	cityState: z.array(tickCityState),
	nationState: z.array(tickNationState),
});

export const wsOutboundAck = z.object({
	type: z.literal("ack"),
	orderId: z.string().uuid(),
});

export const wsOutboundNack = z.object({
	type: z.literal("nack"),
	orderId: z.string().uuid(),
	reason: z.string(),
});

export const wsOutboundOrderResolved = z.object({
	type: z.literal("order-resolved"),
	orderId: z.string().uuid(),
	tick: z.number().int().nonnegative(),
});

export const wsOutboundDesync = z.object({
	type: z.literal("desync"),
	gameId: z.string().uuid(),
	reason: z.string(),
});

export const wsOutboundBuildingComplete = z.object({
	type: z.literal("building_complete"),
	cityId: z.string().uuid(),
	buildingId: z.string().uuid(),
	buildingType: z.string(),
	tick: z.number().int().nonnegative(),
});

export const wsOutboundRevoltStarted = z.object({
	type: z.literal("revolt_started"),
	cityId: z.string().uuid(),
	tick: z.number().int().nonnegative(),
});

export const wsOutboundDefection = z.object({
	type: z.literal("defection"),
	cityId: z.string().uuid(),
	formerOwnerId: z.string().uuid(),
	tick: z.number().int().nonnegative(),
});

export const wsOutboundResearchCompleted = z.object({
	type: z.literal("research_completed"),
	projectId: z.string().uuid(),
	nodeId: z.string(),
	unlockedAtTick: z.number().int().nonnegative(),
	systems: z.array(z.string()),
});

export const wsOutboundMessage = z.discriminatedUnion("type", [
	wsOutboundPong,
	wsOutboundError,
	wsOutboundTick,
	wsOutboundAck,
	wsOutboundNack,
	wsOutboundOrderResolved,
	wsOutboundDesync,
	wsOutboundBuildingComplete,
	wsOutboundRevoltStarted,
	wsOutboundDefection,
	wsOutboundResearchCompleted,
]);
export type WsOutboundMessage = z.infer<typeof wsOutboundMessage>;
export type WsOutboundTick = z.infer<typeof wsOutboundTick>;
export type TickCityState = z.infer<typeof tickCityState>;
export type TickNationState = z.infer<typeof tickNationState>;

// ── Topics (server side) ─────────────────────────────────────────────────────

export const gameTopic = (gameId: string) => `game:${gameId}` as const;
export const playerTopic = (playerId: string) => `player:${playerId}` as const;
