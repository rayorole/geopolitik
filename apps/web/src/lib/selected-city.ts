import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./api-client";

/*
 * Selected-city UI state lives in the TanStack cache so map sprite click and
 * sidebar row click write to the same place and components read via useQuery
 * without prop-drilling. Per CLAUDE.md: no useEffect mirroring server state
 * into useState; the cache is the single source of truth for this kind of
 * shared selection.
 *
 * Pure helpers so they can be unit-tested without React.
 */

export type SelectedCity = string | null;

export function readSelectedCity(qc: QueryClient, gameId: string): SelectedCity {
	return qc.getQueryData<SelectedCity>(queryKeys.selectedCity(gameId)) ?? null;
}

export function writeSelectedCity(qc: QueryClient, gameId: string, cityId: SelectedCity): void {
	qc.setQueryData<SelectedCity>(queryKeys.selectedCity(gameId), cityId);
}

export function toggleSelectedCity(qc: QueryClient, gameId: string, cityId: string): SelectedCity {
	const current = readSelectedCity(qc, gameId);
	const next: SelectedCity = current === cityId ? null : cityId;
	writeSelectedCity(qc, gameId, next);
	return next;
}
