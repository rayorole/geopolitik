import { schema } from "@geopolitik/db";
import {
	type WsOutboundMessage,
	gameTopic,
	playerTopic,
	wsInboundMessage,
} from "@geopolitik/shared";
import type { ServerWebSocket } from "bun";
import { and, eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { logger } from "./logger";

type WsData = {
	userId: string;
	subscribedGameId: string | null;
	subscribedPlayerId: string | null;
};

export async function handleUpgrade(
	req: Request,
	server: { upgrade: (req: Request, opts?: { data?: WsData }) => boolean },
): Promise<Response | undefined> {
	const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}
	const upgraded = server.upgrade(req, {
		data: {
			userId: session.user.id,
			subscribedGameId: null,
			subscribedPlayerId: null,
		},
	});
	if (upgraded) return undefined;
	return new Response("Upgrade failed", { status: 400 });
}

function send(ws: ServerWebSocket<WsData>, msg: WsOutboundMessage) {
	ws.send(JSON.stringify(msg));
}

async function handleSubscribe(ws: ServerWebSocket<WsData>, gameId: string): Promise<void> {
	// Anyone authenticated may subscribe to game-level broadcast (state is public
	// in Phase 2 — fog of war arrives in Phase 7). The player-private topic is
	// only subscribed if the user has actually joined this game.
	ws.subscribe(gameTopic(gameId));
	ws.data.subscribedGameId = gameId;

	const [me] = await db
		.select()
		.from(schema.player)
		.where(and(eq(schema.player.gameId, gameId), eq(schema.player.userId, ws.data.userId)))
		.limit(1);

	if (me) {
		ws.subscribe(playerTopic(me.id));
		ws.data.subscribedPlayerId = me.id;
	}
}

function handleUnsubscribe(ws: ServerWebSocket<WsData>, gameId: string): void {
	if (ws.data.subscribedGameId === gameId) {
		ws.unsubscribe(gameTopic(gameId));
		ws.data.subscribedGameId = null;
	}
	if (ws.data.subscribedPlayerId) {
		ws.unsubscribe(playerTopic(ws.data.subscribedPlayerId));
		ws.data.subscribedPlayerId = null;
	}
}

export const websocketHandlers = {
	open(ws: ServerWebSocket<WsData>) {
		logger.info({ userId: ws.data.userId }, "ws.open");
	},
	async message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
		let payload: unknown;
		try {
			payload = JSON.parse(raw.toString());
		} catch {
			send(ws, { type: "error", code: "invalid_json", message: "Message is not valid JSON." });
			return;
		}

		const parsed = wsInboundMessage.safeParse(payload);
		if (!parsed.success) {
			send(ws, {
				type: "error",
				code: "invalid_message",
				message: parsed.error.issues[0]?.message ?? "Invalid message.",
			});
			return;
		}

		const msg = parsed.data;
		switch (msg.type) {
			case "ping":
				send(ws, { type: "pong", nonce: msg.nonce, serverTime: Date.now() });
				break;
			case "subscribe":
				await handleSubscribe(ws, msg.gameId);
				break;
			case "unsubscribe":
				handleUnsubscribe(ws, msg.gameId);
				break;
		}
	},
	close(ws: ServerWebSocket<WsData>) {
		logger.info({ userId: ws.data.userId }, "ws.close");
	},
};
