/**
 * Single source of truth for site-wide config.
 * Read by metadata, headers, footer, OG tags, legal pages.
 */

export const siteSettings = {
	brand: "GEOPOLITIK",
	tagline: "Command the cold map.",
	description:
		"Async grand strategy on the actual planet. ~140 countries, city-level management, 30-second ticks, multi-week matches.",

	contactEmail: "ray.orole@gmail.com",
	copyrightHolder: "Ray Orolé",
	copyrightYear: 2026,

	// TODO: replace with the real Discord invite once the server exists.
	discordUrl: "https://discord.gg/geopolitik",

	// TODO: replace with the production domain once acquired.
	domain: "https://geopolitik.example",

	legal: {
		jurisdiction: "Belgium",
		// Bumped manually on legal copy changes; surfaces as "last updated" on /tos and /privacy.
		lastUpdated: "2026-04-29",
	},
} as const;

export type SiteSettings = typeof siteSettings;
