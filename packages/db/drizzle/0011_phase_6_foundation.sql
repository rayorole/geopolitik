-- Phase 6 foundation:
--   * extend order_kind enum with all 17 Phase 6 order kinds
--   * create diplomacy enums: treaty_type, treaty_status, alliance_state,
--     alliance_rank, message_channel, trade_proposal_status
--   * create tables: treaty, war, alliance, alliance_membership,
--     alliance_application, alliance_vote, alliance_leave_cooldown,
--     message, message_read, trade_proposal
--
-- Order handlers + WS deltas + UI behavior land in slices 6b–6f.
-- Hand-written (not drizzle-generated) so existing Phase 4 schema isn't
-- re-emitted; the drizzle snapshot in meta/ stays in sync via the journal
-- entry so subsequent migrations diff cleanly.

-- order_kind extensions ────────────────────────────────────────────────
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'propose_treaty';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'respond_treaty';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'break_treaty';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'declare_war';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'propose_trade';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'respond_trade';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'create_alliance';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'apply_alliance';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'vote_alliance';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'respond_alliance_app';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'promote_member';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'demote_leader';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'kick_member';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'leave_alliance';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'dissolve_alliance';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'send_message';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'mark_read';--> statement-breakpoint

-- diplomacy enums ──────────────────────────────────────────────────────
DO $$ BEGIN
 CREATE TYPE "public"."treaty_type" AS ENUM('non_aggression', 'defensive_pact', 'trade_route', 'military_access', 'coalition_war', 'forced_non_aggression');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 CREATE TYPE "public"."treaty_status" AS ENUM('pending', 'active', 'expired', 'broken');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 CREATE TYPE "public"."alliance_state" AS ENUM('active', 'dissolved');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 CREATE TYPE "public"."alliance_rank" AS ENUM('founder', 'leader', 'member');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 CREATE TYPE "public"."message_channel" AS ENUM('dm', 'alliance', 'broadcast');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 CREATE TYPE "public"."trade_proposal_status" AS ENUM('pending', 'accepted', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- treaty ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "treaty" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"type" "treaty_type" NOT NULL,
	"status" "treaty_status" DEFAULT 'pending' NOT NULL,
	"proposer_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"proposed_at_tick" integer NOT NULL,
	"expires_at_tick" integer NOT NULL,
	"activated_at_tick" integer,
	"resolved_at_tick" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "treaty" ADD CONSTRAINT "treaty_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treaty" ADD CONSTRAINT "treaty_proposer_id_player_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treaty" ADD CONSTRAINT "treaty_target_id_player_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "treaty_active_pair_unique" ON "treaty" USING btree ("game_id","type","proposer_id","target_id") WHERE status = 'active';
--> statement-breakpoint

-- war ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "war" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"attacker_id" uuid NOT NULL,
	"defender_id" uuid NOT NULL,
	"declared_at_tick" integer NOT NULL,
	"ended_at_tick" integer,
	"from_defensive_pact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "war" ADD CONSTRAINT "war_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "war" ADD CONSTRAINT "war_attacker_id_player_id_fk" FOREIGN KEY ("attacker_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "war" ADD CONSTRAINT "war_defender_id_player_id_fk" FOREIGN KEY ("defender_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- alliance ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "alliance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"color" text NOT NULL,
	"description" text,
	"state" "alliance_state" DEFAULT 'active' NOT NULL,
	"created_at_tick" integer NOT NULL,
	"dissolved_at_tick" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alliance_game_name_unique" UNIQUE("game_id","name"),
	CONSTRAINT "alliance_game_tag_unique" UNIQUE("game_id","tag")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "alliance" ADD CONSTRAINT "alliance_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- alliance_membership ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "alliance_membership" (
	"alliance_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"rank" "alliance_rank" DEFAULT 'member' NOT NULL,
	"joined_at_tick" integer NOT NULL,
	CONSTRAINT "alliance_membership_alliance_id_player_id_pk" PRIMARY KEY("alliance_id","player_id"),
	CONSTRAINT "alliance_membership_player_unique" UNIQUE("player_id")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "alliance_membership" ADD CONSTRAINT "alliance_membership_alliance_id_alliance_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliance"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alliance_membership" ADD CONSTRAINT "alliance_membership_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- alliance_application ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "alliance_application" (
	"id" uuid PRIMARY KEY NOT NULL,
	"alliance_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"submitted_at_tick" integer NOT NULL,
	"expires_at_tick" integer NOT NULL,
	"resolved_at_tick" integer,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "alliance_application" ADD CONSTRAINT "alliance_application_alliance_id_alliance_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliance"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alliance_application" ADD CONSTRAINT "alliance_application_applicant_id_player_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- alliance_vote ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "alliance_vote" (
	"application_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"vote" text NOT NULL,
	"cast_at_tick" integer NOT NULL,
	CONSTRAINT "alliance_vote_application_id_voter_id_pk" PRIMARY KEY("application_id","voter_id")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "alliance_vote" ADD CONSTRAINT "alliance_vote_application_id_alliance_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."alliance_application"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alliance_vote" ADD CONSTRAINT "alliance_vote_voter_id_player_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- alliance_leave_cooldown ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "alliance_leave_cooldown" (
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"expires_at_tick" integer NOT NULL,
	CONSTRAINT "alliance_leave_cooldown_game_id_player_id_pk" PRIMARY KEY("game_id","player_id")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "alliance_leave_cooldown" ADD CONSTRAINT "alliance_leave_cooldown_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alliance_leave_cooldown" ADD CONSTRAINT "alliance_leave_cooldown_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- message ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"channel" "message_channel" NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_player_id" uuid,
	"recipient_alliance_id" uuid,
	"body" text NOT NULL,
	"sent_at_tick" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_player_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_recipient_player_id_player_id_fk" FOREIGN KEY ("recipient_player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_recipient_alliance_id_alliance_id_fk" FOREIGN KEY ("recipient_alliance_id") REFERENCES "public"."alliance"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- message_read ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "message_read" (
	"player_id" uuid NOT NULL,
	"channel" "message_channel" NOT NULL,
	"peer_key" text NOT NULL,
	"last_seen_message_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_read_player_id_channel_peer_key_pk" PRIMARY KEY("player_id","channel","peer_key")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "message_read" ADD CONSTRAINT "message_read_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- trade_proposal ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "trade_proposal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"proposer_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"give_money" bigint DEFAULT 0 NOT NULL,
	"give_oil" bigint DEFAULT 0 NOT NULL,
	"give_steel" bigint DEFAULT 0 NOT NULL,
	"give_electronics" bigint DEFAULT 0 NOT NULL,
	"receive_money" bigint DEFAULT 0 NOT NULL,
	"receive_oil" bigint DEFAULT 0 NOT NULL,
	"receive_steel" bigint DEFAULT 0 NOT NULL,
	"receive_electronics" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"status" "trade_proposal_status" DEFAULT 'pending' NOT NULL,
	"proposed_at_tick" integer NOT NULL,
	"expires_at_tick" integer NOT NULL,
	"resolved_at_tick" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "trade_proposal" ADD CONSTRAINT "trade_proposal_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_proposal" ADD CONSTRAINT "trade_proposal_proposer_id_player_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_proposal" ADD CONSTRAINT "trade_proposal_target_id_player_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
