-- World fixture v2 (slice A): add area_km2 + is_playable to country.
-- area_km2 sourced from GeoNames countryInfo.txt; is_playable = (area >= 50k km²).
-- Defaults are filler — the 0008 seed migration TRUNCATEs and reloads with
-- real values immediately after this runs.

ALTER TABLE "country" ADD COLUMN IF NOT EXISTS "area_km2" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "country" ADD COLUMN IF NOT EXISTS "is_playable" boolean DEFAULT false NOT NULL;
