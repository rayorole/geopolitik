/*
 * Phase 2 game WebSocket client.
 *
 * Connects to the API WS endpoint, sends a `subscribe` message for the active
 * game, and merges incoming `tick` payloads into the TanStack Query cache via
 * `setQueryData`. Components read state with `useQuery` and never own a
 * mirror copy of server state in `useState` (per CLAUDE.md).
 */

import type { GameSnapshot } from "@geopolitik/shared/api";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "./api-client";
import { publicEnv } from "./env";

export type WsStatus = "connecting" | "open" | "closed";

const sockets = new Map<string, WebSocket>();

type WsTickPayload = {
	type: "tick";
	gameId: string;
	tick: number;
	cityState: GameSnapshot["cityState"];
	nationState: GameSnapshot["nationState"];
};

function applyTick(prev: GameSnapshot | undefined, tick: WsTickPayload): GameSnapshot | undefined {
	if (!prev) return prev;
	return {
		...prev,
		game: { ...prev.game, tick: tick.tick },
		cityState: tick.cityState,
		nationState: tick.nationState,
	};
}

export function getGameSocket(gameId: string, qc: QueryClient): WebSocket {
	const existing = sockets.get(gameId);
	if (existing && existing.readyState !== WebSocket.CLOSED) return existing;

	const ws = new WebSocket(publicEnv.NEXT_PUBLIC_WS_URL);
	sockets.set(gameId, ws);

	const setStatus = (s: WsStatus) => qc.setQueryData(queryKeys.wsStatus(gameId), s);

	setStatus("connecting");
	ws.onopen = () => {
		setStatus("open");
		ws.send(JSON.stringify({ type: "subscribe", gameId }));
	};
	ws.onclose = () => {
		setStatus("closed");
		sockets.delete(gameId);
	};
	ws.onerror = () => setStatus("closed");
	ws.onmessage = (event) => {
		let msg: { type?: string } & Record<string, unknown>;
		try {
			msg = JSON.parse(String(event.data));
		} catch {
			return;
		}

		if (msg.type === "tick" && msg.gameId === gameId) {
			qc.setQueryData<GameSnapshot>(queryKeys.gameSnapshot(gameId), (prev) =>
				applyTick(prev, msg as unknown as WsTickPayload),
			);
			// Tick payload only carries city + nation state; building state advances
			// in lockstep on the server but isn't (yet) inlined into the tick. Refetch
			// the snapshot so cityBuildings reflects matured rows. Cheap because the
			// snapshot is small in Phase 3.
			qc.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
		}
		// ack / nack / order-resolved trigger a snapshot refetch — at Phase 2
		// orders are noop and don't change state, so a refetch is harmless and
		// keeps the order list in sync without bespoke merge logic.
		if (msg.type === "ack" || msg.type === "nack" || msg.type === "order-resolved") {
			qc.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
		}
		if (msg.type === "building_complete") {
			toast.success(`${(msg.buildingType as string) ?? "Building"} completed`);
			qc.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
		}
		if (msg.type === "desync") {
			qc.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
		}
	};

	return ws;
}

export function closeGameSocket(gameId: string): void {
	const ws = sockets.get(gameId);
	if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
	sockets.delete(gameId);
}
