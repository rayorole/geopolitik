/*
 * GeoPolitik world generator — Phase 0 placeholder.
 * Phase 1 implements OSM ingest, PostGIS precompute, and SQL+JSON output to packages/world-data.
 */

import { parseArgs } from "node:util";

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		preset: { type: "string", default: "earth-small" },
		help: { type: "boolean", short: "h", default: false },
	},
	allowPositionals: false,
});

if (values.help) {
	console.log(`
geopolitik-worldgen

Usage:
  bun run worldgen --preset=<name>

Presets (Phase 1):
  earth-small     ~30 countries, ~500 cities (target)
  europe          European theatre only
  test            Tiny test world for unit tests

Phase 0 status: placeholder. Real ingest pipeline lands in Phase 1.
`);
	process.exit(0);
}

console.log(`[worldgen] preset=${values.preset}`);
console.log("[worldgen] Phase 0 placeholder — real generator lands in Phase 1.");
