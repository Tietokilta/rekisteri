ALTER TABLE "member" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "organization_name" text;--> statement-breakpoint
ALTER TABLE "membership_type" ADD COLUMN "purchasable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_or_org" CHECK (("member"."user_id" IS NOT NULL AND "member"."organization_name" IS NULL) OR ("member"."user_id" IS NULL AND "member"."organization_name" IS NOT NULL));