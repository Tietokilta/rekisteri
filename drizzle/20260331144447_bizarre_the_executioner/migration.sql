DROP INDEX "unique_verified_secondary_email";--> statement-breakpoint
CREATE UNIQUE INDEX "unique_verified_secondary_email" ON "secondary_email" ("email") WHERE "verified_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "user" RENAME CONSTRAINT "user_qrToken_unique" TO "user_qr_token_key";--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" ("user_id");--> statement-breakpoint
CREATE INDEX "member_membership_id_idx" ON "member" ("membership_id");--> statement-breakpoint
CREATE INDEX "member_status_idx" ON "member" ("status");--> statement-breakpoint
ALTER TABLE "member" DROP CONSTRAINT "member_user_or_org", ADD CONSTRAINT "member_user_or_org" CHECK (("user_id" IS NOT NULL AND "organization_name" IS NULL) OR ("user_id" IS NULL AND "organization_name" IS NOT NULL));