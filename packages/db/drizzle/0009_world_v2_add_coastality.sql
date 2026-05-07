-- World fixture v2 (slice C): add is_landlocked + is_coastal flags.
-- country.is_landlocked — true for the 44 hardcoded landlocked nations
--   plus Caspian-only (KAZ, TKM, AZE) which have shoreline but no ocean.
-- city.is_coastal — true if (city is within 10 km of NE 50m coastline OR
--   listed in port-overrides.json) AND country is NOT landlocked.
-- Defaults are filler — the 0010 seed migration TRUNCATEs and reloads with
-- real values immediately after this runs.

ALTER TABLE "country" ADD COLUMN IF NOT EXISTS "is_landlocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "city" ADD COLUMN IF NOT EXISTS "is_coastal" boolean DEFAULT false NOT NULL;
