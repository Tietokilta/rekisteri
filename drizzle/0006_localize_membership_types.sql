-- Create membership_type table with localized fields
CREATE TABLE "membership_type" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Migrate existing membership types to the new table
-- This creates membership_type records based on unique 'type' values in membership table
INSERT INTO "membership_type" ("id", "name", "description", "created_at", "updated_at")
SELECT DISTINCT
	membership.type as id,
	jsonb_build_object(
		'fi', CASE membership.type
			WHEN 'varsinainen-jasen' THEN 'Varsinainen jäsen'
			WHEN 'ulkojasen' THEN 'Ulkojäsen'
			WHEN 'kannatusjasen' THEN 'Kannatusjäsen'
			ELSE membership.type
		END,
		'en', CASE membership.type
			WHEN 'varsinainen-jasen' THEN 'Regular member'
			WHEN 'ulkojasen' THEN 'External member'
			WHEN 'kannatusjasen' THEN 'Supporting member'
			ELSE membership.type
		END
	) as name,
	jsonb_build_object(
		'fi', CASE membership.type
			WHEN 'varsinainen-jasen' THEN 'Aalto-yliopiston tietotekniikan opiskelijoille'
			WHEN 'ulkojasen' THEN 'Muille kuin Aalto-yliopiston tietotekniikan opiskelijoille'
			WHEN 'kannatusjasen' THEN 'Tukea Tietokillan toimintaa'
			ELSE NULL
		END,
		'en', CASE membership.type
			WHEN 'varsinainen-jasen' THEN 'For computer science students at Aalto University'
			WHEN 'ulkojasen' THEN 'For non-computer science students'
			WHEN 'kannatusjasen' THEN 'Support the activities of Tietokilta'
			ELSE NULL
		END
	) as description,
	now() as created_at,
	now() as updated_at
FROM membership
WHERE membership.type IS NOT NULL;
--> statement-breakpoint

-- Add new membership_type_id column to membership table
ALTER TABLE "membership" ADD COLUMN "membership_type_id" text;
--> statement-breakpoint

-- Populate the new column with references to membership_type
UPDATE "membership"
SET "membership_type_id" = "type";
--> statement-breakpoint

-- Make the column NOT NULL now that it's populated
ALTER TABLE "membership" ALTER COLUMN "membership_type_id" SET NOT NULL;
--> statement-breakpoint

-- Add foreign key constraint
ALTER TABLE "membership" ADD CONSTRAINT "membership_membership_type_id_membership_type_id_fk"
FOREIGN KEY ("membership_type_id") REFERENCES "public"."membership_type"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Add timestamps to membership table if they don't exist
ALTER TABLE "membership" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint

-- Drop the old type column
ALTER TABLE "membership" DROP COLUMN "type";
