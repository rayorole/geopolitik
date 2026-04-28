/*
 * REST client for the Phase 2 game lifecycle API.
 * Thin fetch wrappers; auth via Better Auth session cookies (`credentials: include`).
 */

import type {
	CreateGameResponse,
	GameSnapshot,
	GameSummary,
	JoinGameBody,
	SubmitOrderResponse,
	WorldDataset,
} from "@geopolitik/shared/api";
import type { BuildingsCatalog } from "@geopolitik/shared/buildings";
import type { SubmitOrderBodyV3 } from "@geopolitik/shared/orders";
import { publicEnv } from "./env";

const API = publicEnv.NEXT_PUBLIC_API_URL;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API}${path}`, {
		credentials: "include",
		headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
		...init,
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`${res.status} ${res.statusText}: ${text}`);
	}
	return (await res.json()) as T;
}

export const gamesApi = {
	create: (): Promise<CreateGameResponse> => api<CreateGameResponse>("/games", { method: "POST" }),

	browse: (): Promise<GameSummary[]> => api<GameSummary[]>("/games"),

	byCode: (code: string): Promise<GameSummary> =>
		api<GameSummary>(`/games/by-code/${encodeURIComponent(code.toUpperCase())}`),

	join: (gameId: string, body: JoinGameBody): Promise<{ playerId: string; color: string }> =>
		api(`/games/${gameId}/join`, { method: "POST", body: JSON.stringify(body) }),

	leave: (gameId: string): Promise<{ ok: true }> =>
		api(`/games/${gameId}/leave`, { method: "POST" }),

	snapshot: (gameId: string): Promise<GameSnapshot> =>
		api<GameSnapshot>(`/games/${gameId}/snapshot`),

	submitOrder: (gameId: string, body: SubmitOrderBodyV3): Promise<SubmitOrderResponse> =>
		api(`/games/${gameId}/orders`, { method: "POST", body: JSON.stringify(body) }),

	cancelOrder: (gameId: string, orderId: string): Promise<{ ok: true }> =>
		api(`/games/${gameId}/orders/${orderId}`, { method: "DELETE" }),
};

export const worldApi = {
	cities: (): Promise<WorldDataset> => api<WorldDataset>("/world/cities"),
	buildings: (): Promise<BuildingsCatalog> => api<BuildingsCatalog>("/world/buildings"),
};

export const queryKeys = {
	gamesBrowse: ["games", "browse"] as const,
	gameSummary: (id: string) => ["games", "summary", id] as const,
	gameByCode: (code: string) => ["games", "by-code", code] as const,
	gameSnapshot: (id: string) => ["games", "snapshot", id] as const,
	worldCities: ["world", "cities"] as const,
	worldBuildings: ["world", "buildings"] as const,
	wsStatus: (id: string) => ["games", id, "ws", "status"] as const,
	selectedCity: (gameId: string) => ["games", gameId, "ui", "selectedCity"] as const,
};
