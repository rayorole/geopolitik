import { z } from "zod";

/*
 * WebSocket message schemas — Phase 0 starter.
 * Server-authoritative: every inbound message is parsed by these schemas before
 * the server trusts it. Outbound messages are typed but not parsed by clients;
 * clients trust the server.
 *
 * Phase 2 grows this with `tick`, `event`, `ack`, `desync` per CLAUDE.md.
 */

export const wsInboundPing = z.object({
	type: z.literal("ping"),
	nonce: z.string().min(1).max(64),
});

export const wsInboundMessage = z.discriminatedUnion("type", [wsInboundPing]);
export type WsInboundMessage = z.infer<typeof wsInboundMessage>;

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

export const wsOutboundMessage = z.discriminatedUnion("type", [wsOutboundPong, wsOutboundError]);
export type WsOutboundMessage = z.infer<typeof wsOutboundMessage>;
