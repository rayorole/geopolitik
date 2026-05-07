-- Phase 4 foundation:
--   * drop nation_state.rp (replaced by lab `effects` field on buildings.json)
--   * add nation_state.research_slot_max (defaults to 2; Phase 9 Command Pass bumps it)
--   * create research_project_status enum
--   * create research_project (in_progress + history; partial unique index keeps one active project per node per player)
--   * create research_unlock (PK gameId/playerId/nodeId; tier-0 starter pack seeded on player join)

ALTER TABLE "nation_state" DROP COLUMN IF EXISTS "rp";--> statement-breakpoint
ALTER TABLE "nation_state" ADD COLUMN IF NOT EXISTS "research_slot_max" integer DEFAULT 2 NOT NULL;--> statement-breakpoint

DO $$ BEGIN
 CREATE TYPE "public"."research_project_status" AS ENUM('in_progress', 'completed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "research_project" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"status" "research_project_status" DEFAULT 'in_progress' NOT NULL,
	"cost_money" bigint NOT NULL,
	"cost_oil" bigint NOT NULL,
	"cost_steel" bigint NOT NULL,
	"cost_electronics" bigint NOT NULL,
	"started_at_tick" integer NOT NULL,
	"expected_completion_tick" integer NOT NULL,
	"resolved_at_tick" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "research_unlock" (
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"unlocked_at_tick" integer NOT NULL,
	"via_project_id" uuid,
	CONSTRAINT "research_unlock_game_id_player_id_node_id_pk" PRIMARY KEY("game_id","player_id","node_id")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "research_project" ADD CONSTRAINT "research_project_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_project" ADD CONSTRAINT "research_project_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_unlock" ADD CONSTRAINT "research_unlock_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_unlock" ADD CONSTRAINT "research_unlock_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_unlock" ADD CONSTRAINT "research_unlock_via_project_id_research_project_id_fk" FOREIGN KEY ("via_project_id") REFERENCES "public"."research_project"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "research_project_active_unique" ON "research_project" USING btree ("game_id","player_id","node_id") WHERE status = 'in_progress';
