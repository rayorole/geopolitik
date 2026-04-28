import type { QueryClient } from "@tanstack/react-query";
import { publicEnv } from "./env";

export type WsStatus = "connecting" | "open" | "closed";
export type WsLine = { dir: "in" | "out"; text: string; ts: number };

export const wsStatusKey = (gameId: string) => ["game", gameId, "ws", "status"] as const;
export const wsLogKey = (gameId: string) => ["game", gameId, "ws", "log"] as const;

const sockets = new Map<string, WebSocket>();

export function getGameSocket(gameId: string, qc: QueryClient): WebSocket {
	const existing = sockets.get(gameId);
	if (existing && existing.readyState !== WebSocket.CLOSED) return existing;

	const ws = new WebSocket(publicEnv.NEXT_PUBLIC_WS_URL);
	sockets.set(gameId, ws);

	const setStatus = (s: WsStatus) => qc.setQueryData(wsStatusKey(gameId), s);
	const append = (line: WsLine) =>
		qc.setQueryData<WsLine[]>(wsLogKey(gameId), (prev = []) => [...prev, line]);

	setStatus("connecting");
	ws.onopen = () => setStatus("open");
	ws.onclose = () => {
		setStatus("closed");
		sockets.delete(gameId);
	};
	ws.onerror = () => setStatus("closed");
	ws.onmessage = (event) => append({ dir: "in", text: String(event.data), ts: Date.now() });

	return ws;
}

export function sendPing(gameId: string, qc: QueryClient): string {
	const ws = getGameSocket(gameId, qc);
	if (ws.readyState !== WebSocket.OPEN) {
		throw new Error("WebSocket is not open yet.");
	}
	const nonce = crypto.randomUUID();
	const payload = JSON.stringify({ type: "ping", nonce });
	ws.send(payload);
	qc.setQueryData<WsLine[]>(wsLogKey(gameId), (prev = []) => [
		...prev,
		{ dir: "out", text: payload, ts: Date.now() },
	]);
	return nonce;
}

export function clearLog(gameId: string, qc: QueryClient): void {
	qc.setQueryData<WsLine[]>(wsLogKey(gameId), []);
}
