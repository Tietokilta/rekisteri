-- Add last_active_at column to track user activity for GDPR compliance
-- Users inactive for 6+ years will be subject to cleanup
ALTER TABLE "user" ADD COLUMN "last_active_at" timestamp with time zone;
--> statement-breakpoint
-- Backfill existing users with their most recent known activity
-- Uses updatedAt as a reasonable proxy for last activity
UPDATE "user" SET "last_active_at" = "updated_at";
