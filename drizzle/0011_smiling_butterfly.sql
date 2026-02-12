-- Rename member status enum values to align with Tietokilta bylaws (säännöt):
-- "expired" → "resigned" (eronnut: voluntary resignation §8p1, deemed resigned §8p2, expelled §9)
-- "cancelled" → "rejected" (hylätty: board rejected application, or payment failed)

ALTER TABLE "member" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "member" SET "status" = 'resigned' WHERE "status" = 'expired';--> statement-breakpoint
UPDATE "member" SET "status" = 'rejected' WHERE "status" = 'cancelled';--> statement-breakpoint
DROP TYPE "public"."member_status";--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('awaiting_payment', 'awaiting_approval', 'active', 'resigned', 'rejected');--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "status" SET DATA TYPE "public"."member_status" USING "status"::"public"."member_status";
