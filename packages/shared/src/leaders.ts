import { z } from "zod";
import leadersJson from "../data/leaders.json" with { type: "json" };

/*
 * Leaders — Phase 6.
 *
 * Real-world leader names + generic office titles for the diplomacy
 * Nations tab. Each ISO3 entry has a required `title` (the office name)
 * and an optional `name` (the current incumbent's full name).
 *
 * Renderer rule:
 *   - If `name` is present → display name verbatim.
 *   - Else → "{title} of {countryName}" (caller resolves countryName).
 *   - Missing ISO3 → "Head of State of {countryName}" (caller resolves).
 *
 * Player-controlled nations override this entirely with the player's
 * display name; this catalog is consulted only for Open / Computer
 * (Sleeper Nation) cards.
 *
 * The `name` field is the legal-mitigation lever per CLAUDE.md
 * "Differentiation & legal guardrails": deleting all `name` fields
 * across this JSON cleanly degrades every Sleeper Nation to its office
 * + country, no code change required.
 *
 * Bad JSON = deploy-time failure, not runtime, by parsing at module load.
 */

export const leaderEntry = z
	.object({
		name: z.string().min(1).max(64).optional(),
		title: z.string().min(1).max(48),
	})
	.strict();
export type LeaderEntry = z.infer<typeof leaderEntry>;

export const leadersCatalog = z
	.object({
		version: z.literal(1),
		leaders: z.record(z.string().length(3), leaderEntry),
	})
	.strict()
	.superRefine((c, ctx) => {
		for (const code of Object.keys(c.leaders)) {
			if (!/^[A-Z]{3}$/.test(code)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `country code must be ISO alpha-3 uppercase: ${code}`,
					path: ["leaders", code],
				});
			}
		}
	});
export type LeadersCatalog = z.infer<typeof leadersCatalog>;

export const LEADERS_CATALOG: LeadersCatalog = leadersCatalog.parse(leadersJson);

/** Office + name lookup. Returns undefined when the country code is not
 *  in the catalog — callers should fall back to "Head of State". */
export function leaderForCountry(countryCode: string): LeaderEntry | undefined {
	return LEADERS_CATALOG.leaders[countryCode];
}

/** Final-string renderer for the diplomacy Nations tab. Use this when
 *  the country is not held by a player; for player-held countries, the
 *  player's display name supersedes this entirely.
 *
 *  - "Donald J. Trump"                 (entry has `name`)
 *  - "President of United States"      (entry has only `title`)
 *  - "Head of State of Vanuatu"        (entry missing from catalog)
 */
export function renderLeaderName(countryCode: string, countryName: string): string {
	const entry = leaderForCountry(countryCode);
	if (entry?.name) return entry.name;
	if (entry?.title) return `${entry.title} of ${countryName}`;
	return `Head of State of ${countryName}`;
}
