/**
 * Player faction color resolution.
 *
 * The server stores player colors as CSS-variable-name tokens
 * (`"faction-01"` through `"faction-12"`) chosen at join time by
 * `pickFactionColor` in apps/api. These map onto the
 * `--color-faction-NN` design tokens defined in the Tailwind theme.
 *
 * For DOM consumers (`backgroundColor: …`) the token is resolved through
 * `var(--color-faction-NN)` which the browser handles natively.
 *
 * For MapLibre consumers (`circle-color`) the style spec doesn't accept
 * CSS variable names OR oklch() syntax — it needs a real sRGB hex value.
 * We mirror the design tokens here as their closest sRGB equivalents,
 * same approach the existing `COLOR` const in game-map.tsx takes for
 * ink/signal colors.
 *
 * Keep `FACTION_HEX` in sync with `--color-faction-NN` in
 * `packages/config/tailwind/theme.css`.
 */

export const FACTION_TOKENS = [
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

export type FactionToken = (typeof FACTION_TOKENS)[number];

/** Hex equivalents of the `--color-faction-NN` oklch tokens. Approximate
 *  conversions of `oklch(70% 0.13 hue)` (or `oklch(78% 0.05 90)` for the
 *  neutral 12). Visual differentiation matters more than exact match. */
export const FACTION_HEX: Record<FactionToken, string> = {
	"faction-01": "#dd9698", // crimson  (hue 0)
	"faction-02": "#df9b73", // rust     (hue 30)
	"faction-03": "#ce9f5b", // ochre    (hue 60)
	"faction-04": "#b1a356", // moss     (hue 95)
	"faction-05": "#80b083", // jade     (hue 140)
	"faction-06": "#66b1aa", // teal     (hue 180)
	"faction-07": "#74acc8", // steel    (hue 215)
	"faction-08": "#93a5dc", // indigo   (hue 250)
	"faction-09": "#b89cd2", // violet   (hue 285)
	"faction-10": "#d29ad0", // magenta  (hue 320)
	"faction-11": "#db95b3", // rose     (hue 350)
	"faction-12": "#ccc09c", // neutral  (L 78, hue 90)
};

/** Translate a stored faction token into a real hex color. Unknown
 *  tokens (non-faction strings, null, undefined) return null so callers
 *  can pick a neutral fallback. */
export function factionToHex(token: string | null | undefined): string | null {
	if (!token) return null;
	if (token in FACTION_HEX) return FACTION_HEX[token as FactionToken];
	// Tolerate raw hex / rgb / oklch values too — if it already looks
	// like a real CSS color, pass through.
	if (token.startsWith("#") || token.startsWith("rgb") || token.startsWith("oklch")) {
		return token;
	}
	return null;
}

/** DOM-side: prefer the CSS-variable form so the design system stays the
 *  source of truth for the actual displayed color. Fallback to hex when
 *  the token isn't recognized. */
export function factionToCss(token: string | null | undefined): string | null {
	if (!token) return null;
	if (token in FACTION_HEX) return `var(--color-${token})`;
	if (token.startsWith("#") || token.startsWith("rgb") || token.startsWith("oklch")) {
		return token;
	}
	return null;
}
