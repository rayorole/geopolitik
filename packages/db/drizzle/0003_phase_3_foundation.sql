CREATE TYPE "public"."city_building_state" AS ENUM('in_progress', 'complete', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE 'build';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE 'cancel_build';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE 'set_slider';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "city_building" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"city_id" uuid NOT NULL,
	"type" text NOT NULL,
	"state" "city_building_state" DEFAULT 'in_progress' NOT NULL,
	"started_at_tick" integer NOT NULL,
	"completes_at_tick" integer,
	"built_by_player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "city_state" ADD COLUMN "unrest" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "city_state" ADD COLUMN "in_revolt_since_tick" integer;--> statement-breakpoint
ALTER TABLE "nation_state" ADD COLUMN "rp" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nation_state" ADD COLUMN "taxation" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "nation_state" ADD COLUMN "welfare" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "nation_state" ADD COLUMN "healthcare" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "nation_state" ADD COLUMN "propaganda" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "city_building" ADD CONSTRAINT "city_building_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "city_building" ADD CONSTRAINT "city_building_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "city_building" ADD CONSTRAINT "city_building_built_by_player_id_player_id_fk" FOREIGN KEY ("built_by_player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "city_building_active_unique" ON "city_building" USING btree ("game_id","city_id","type") WHERE "city_building"."state" IN ('in_progress', 'complete');