/*
 * Faction color picker.
 * Maps 1..12 player slots onto the --color-faction-01..12 design tokens.
 * Beyond 12 we cycle (Phase 2 caps at 75 players, but visual reuse beyond
 * 12 is accepted — colors are differentiation, not identity).
 */

const FACTION_TOKENS = [
	"faction-01",
	"faction-02",
	"faction-03",
	"faction-04",
	"faction-05",
	"faction-06",
	"faction-07",
	"faction-08",
	"faction-09",
	"faction-10",
	"faction-11",
	"faction-12",
] as const;

export function pickFactionColor(takenColors: string[]): string {
	for (const t of FACTION_TOKENS) {
		if (!takenColors.includes(t)) return t;
	}
	// All 12 taken — cycle deterministically by player count
	// biome-ignore lint/style/noNonNullAssertion: FACTION_TOKENS is non-empty
	return FACTION_TOKENS[takenColors.length % FACTION_TOKENS.length]!;
}
