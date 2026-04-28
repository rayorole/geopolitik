import { type WsOutboundMessage, wsInboundMessage } from "@geopolitik/shared";
import type { ServerWebSocket } from "bun";
import { auth } from "./auth";
import { logger } from "./logger";

type WsData = {
	userId: string;
};

export async function handleUpgrade(
	req: Request,
	server: { upgrade: (req: Request, opts?: { data?: WsData }) => boolean },
): Promise<Response | undefined> {
	const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}
	const upgraded = server.upgrade(req, { data: { userId: session.user.id } });
	if (upgraded) return undefined;
	return new Response("Upgrade failed", { status: 400 });
}

function send(ws: ServerWebSocket<WsData>, msg: WsOutboundMessage) {
	ws.send(JSON.stringify(msg));
}

export const websocketHandlers = {
	open(ws: ServerWebSocket<WsData>) {
		logger.info({ userId: ws.data.userId }, "ws.open");
	},
	message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
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
		if (msg.type === "ping") {
			send(ws, { type: "pong", nonce: msg.nonce, serverTime: Date.now() });
		}
	},
	close(ws: ServerWebSocket<WsData>) {
		logger.info({ userId: ws.data.userId }, "ws.close");
	},
};
