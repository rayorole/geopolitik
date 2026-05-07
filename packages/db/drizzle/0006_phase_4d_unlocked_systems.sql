-- Phase 4d: nation_state.unlocked_systems text[] tracks system-level
-- unlocks from research nodes (Phase 7 satellite_scope hook). Idempotent
-- via ADD COLUMN IF NOT EXISTS.

ALTER TABLE "nation_state"
	ADD COLUMN IF NOT EXISTS "unlocked_systems" text[] NOT NULL DEFAULT ARRAY[]::text[];
