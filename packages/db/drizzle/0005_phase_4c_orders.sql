-- Phase 4c orders: extend the order_kind enum with start_research + cancel_research.
-- ALTER TYPE ADD VALUE IF NOT EXISTS makes this idempotent on retry.

ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'start_research';--> statement-breakpoint
ALTER TYPE "public"."order_kind" ADD VALUE IF NOT EXISTS 'cancel_research';
