/*
 * REST client for the Phase 2 game lifecycle API.
 * Thin fetch wrappers; auth via Better Auth session cookies (`credentials: include`).
 */

import type {
	CreateGameResponse,
	GameSnapshot,
	GameSummary,
	JoinGameBody,
	MineGameSummary,
	PlayerResearchResponse,
	SubmitOrderResponse,
	UpdateProfileBody,
	UpdateProfileResponse,
	WorldDataset,
} from "@geopolitik/shared/api";
import type { BuildingsCatalog } from "@geopolitik/shared/buildings";
import type { FactionId, FactionsCatalog } from "@geopolitik/shared/factions";
import type { SubmitOrderBodyV3 } from "@geopolitik/shared/orders";
import type { ResearchTreeFile } from "@geopolitik/shared/research";
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

	mine: (): Promise<MineGameSummary[]> => api<MineGameSummary[]>("/games/mine"),

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

	research: (gameId: string): Promise<PlayerResearchResponse> =>
		api<PlayerResearchResponse>(`/games/${gameId}/research`),

	// Phase 6: server-side type is broad (Drizzle row types). The client treats
	// this as `unknown`-ish data for now and narrows where consumed.
	diplomacy: (gameId: string): Promise<DiplomacySnapshot> =>
		api<DiplomacySnapshot>(`/games/${gameId}/diplomacy`),
};

export interface DiplomacyAlliance {
	id: string;
	gameId: string;
	name: string;
	tag: string;
	color: string;
	description: string | null;
	state: "active" | "dissolved";
	createdAtTick: number;
	dissolvedAtTick: number | null;
	createdAt: string;
}

export interface DiplomacyMembership {
	allianceId: string;
	playerId: string;
	rank: "founder" | "leader" | "member";
	joinedAtTick: number;
}

export interface DiplomacyApplication {
	id: string;
	allianceId: string;
	applicantId: string;
	submittedAtTick: number;
	expiresAtTick: number;
	resolvedAtTick: number | null;
	resolution: string | null;
}

export interface DiplomacyTreaty {
	id: string;
	gameId: string;
	type:
		| "non_aggression"
		| "defensive_pact"
		| "trade_route"
		| "military_access"
		| "coalition_war"
		| "forced_non_aggression";
	status: "pending" | "active" | "expired" | "broken";
	proposerId: string;
	targetId: string;
	proposedAtTick: number;
	expiresAtTick: number;
	activatedAtTick: number | null;
	resolvedAtTick: number | null;
	note: string | null;
}

export interface DiplomacyTradeProposal {
	id: string;
	gameId: string;
	proposerId: string;
	targetId: string;
	giveMoney: number;
	giveOil: number;
	giveSteel: number;
	giveElectronics: number;
	receiveMoney: number;
	receiveOil: number;
	receiveSteel: number;
	receiveElectronics: number;
	note: string | null;
	status: "pending" | "accepted" | "rejected" | "expired";
	proposedAtTick: number;
	expiresAtTick: number;
	resolvedAtTick: number | null;
}

export interface DiplomacyMessage {
	id: string;
	gameId: string;
	channel: "dm" | "alliance" | "broadcast";
	senderId: string;
	recipientPlayerId: string | null;
	recipientAllianceId: string | null;
	body: string;
	sentAtTick: number;
	createdAt: string;
}

export interface DiplomacyMessageRead {
	playerId: string;
	channel: "dm" | "alliance" | "broadcast";
	peerKey: string;
	lastSeenMessageId: string;
}

export interface DiplomacyWar {
	id: string;
	attackerId: string;
	defenderId: string;
	declaredAtTick: number;
	endedAtTick: number | null;
	fromDefensivePact: boolean;
}

export interface DiplomacyLeaveCooldown {
	gameId: string;
	playerId: string;
	expiresAtTick: number;
}

export interface DiplomacySnapshot {
	gameId: string;
	playerId: string;
	myAlliance: DiplomacyAlliance | null;
	myMembership: DiplomacyMembership | null;
	allMembers: DiplomacyMembership[];
	directory: DiplomacyAlliance[];
	incomingApps: DiplomacyApplication[];
	myApplications: DiplomacyApplication[];
	incomingTreaties: DiplomacyTreaty[];
	outgoingTreaties: DiplomacyTreaty[];
	activeTreaties: DiplomacyTreaty[];
	incomingTrades: DiplomacyTradeProposal[];
	outgoingTrades: DiplomacyTradeProposal[];
	leaveCooldown: DiplomacyLeaveCooldown | null;
	wars: DiplomacyWar[];
	messages: {
		dms: DiplomacyMessage[];
		alliance: DiplomacyMessage[];
		broadcast: DiplomacyMessage[];
		reads: DiplomacyMessageRead[];
	};
}

export const worldApi = {
	cities: (): Promise<WorldDataset> => api<WorldDataset>("/world/cities"),
	buildings: (): Promise<BuildingsCatalog> => api<BuildingsCatalog>("/world/buildings"),
	factions: (): Promise<FactionsCatalog> => api<FactionsCatalog>("/world/factions"),
	researchTrees: (faction: FactionId): Promise<{ faction: FactionId; trees: ResearchTreeFile[] }> =>
		api(`/world/research/${faction}`),
};

export const accountApi = {
	updateProfile: (body: UpdateProfileBody): Promise<UpdateProfileResponse> =>
		api<UpdateProfileResponse>("/account/profile", {
			method: "PATCH",
			body: JSON.stringify(body),
		}),
};

export const queryKeys = {
	gamesBrowse: ["games", "browse"] as const,
	gamesMine: ["games", "mine"] as const,
	gameSummary: (id: string) => ["games", "summary", id] as const,
	gameByCode: (code: string) => ["games", "by-code", code] as const,
	gameSnapshot: (id: string) => ["games", "snapshot", id] as const,
	gameResearch: (id: string) => ["games", "research", id] as const,
	gameDiplomacy: (id: string) => ["games", "diplomacy", id] as const,
	worldCities: ["world", "cities"] as const,
	worldBuildings: ["world", "buildings"] as const,
	worldFactions: ["world", "factions"] as const,
	worldResearchTrees: (faction: FactionId) => ["world", "research", faction] as const,
	wsStatus: (id: string) => ["games", id, "ws", "status"] as const,
	selectedCity: (gameId: string) => ["games", gameId, "ui", "selectedCity"] as const,
};
