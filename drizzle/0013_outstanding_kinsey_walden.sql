-- Create the admin_role enum type
CREATE TYPE "public"."admin_role" AS ENUM('none', 'readonly', 'admin');--> statement-breakpoint

-- Add the new admin_role column
ALTER TABLE "user" ADD COLUMN "admin_role" "admin_role" NOT NULL DEFAULT 'none';--> statement-breakpoint

-- Backfill: convert is_admin boolean to admin_role enum
UPDATE "user" SET "admin_role" = CASE WHEN "is_admin" = true THEN 'admin'::admin_role ELSE 'none'::admin_role END;--> statement-breakpoint

-- Drop the old is_admin column
ALTER TABLE "user" DROP COLUMN "is_admin";
