-- Add last_active_at column to track user activity for GDPR compliance
-- Users inactive for 6+ years will be subject to cleanup
ALTER TABLE "user" ADD COLUMN "last_active_at" timestamp with time zone;
--> statement-breakpoint
-- Backfill existing users with their most recent known activity
-- Uses updatedAt as a reasonable proxy for last activity
UPDATE "user" SET "last_active_at" = "updated_at";
--> statement-breakpoint
-- Create trigger function to update last_active_at on session activity
CREATE OR REPLACE FUNCTION update_user_last_active_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE "user" SET "last_active_at" = NOW() WHERE "id" = NEW."user_id";
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Trigger on session insert/update to track user activity
CREATE TRIGGER session_activity_trigger
AFTER INSERT OR UPDATE ON "session"
FOR EACH ROW
EXECUTE FUNCTION update_user_last_active_at();
