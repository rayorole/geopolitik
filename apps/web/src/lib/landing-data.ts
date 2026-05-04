import type { TestWorld } from "@geopolitik/world-data";
import worldData from "@geopolitik/world-data/test-world";

const world = worldData as unknown as TestWorld;

export type GlobeMarker = { location: [number, number]; size: number };

/**
 * Capital coordinates from the Phase 2 worldgen fixture, rendered as cobe markers
 * on the landing-page globe. Truthful: the same data the game ships with.
 */
export function getLandingMarkers(): GlobeMarker[] {
	return world.cities
		.filter((c) => c.isCapital)
		.map((c) => ({ location: [c.lat, c.lng] as [number, number], size: 0.04 }));
}
