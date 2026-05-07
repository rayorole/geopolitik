import { renderLeaderName } from "@geopolitik/shared/leaders";

/**
 * Diplomacy Nations tab leader-name resolver.
 *
 * Player-controlled nations show the player's display name verbatim.
 * Sleeper Nations (Open + Computer) fall through to the leaders catalog
 * via `renderLeaderName`, which prefers a real incumbent name when one
 * is recorded and otherwise renders "<title> of <country>".
 */
export function resolveLeaderName({
	countryCode,
	countryName,
	ownerDisplayName,
}: {
	countryCode: string;
	countryName: string;
	ownerDisplayName?: string | null;
}): string {
	if (ownerDisplayName) return ownerDisplayName;
	return renderLeaderName(countryCode, countryName);
}
