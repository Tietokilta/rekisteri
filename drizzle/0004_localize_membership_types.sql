-- Create membership_type table
CREATE TABLE "membership_type" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fi" text NOT NULL,
	"name_en" text NOT NULL,
	"description_fi" text,
	"description_en" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Insert default membership types
INSERT INTO "membership_type" ("id", "name_fi", "name_en", "description_fi", "description_en") VALUES
	('varsinainen-jasen', 'Varsinainen jäsen', 'Regular member', 'Aalto-yliopiston tietotekniikan opiskelijoille', 'For computer science students at Aalto University'),
	('ulkojasen', 'Ulkojäsen', 'External member', 'Muille kuin Aalto-yliopiston tietotekniikan opiskelijoille', 'For non-computer science students'),
	('kannatusjasen', 'Kannatusjäsen', 'Supporting member', 'Tukea Tietokillan toimintaa', 'Support the activities of Tietokilta');
--> statement-breakpoint

-- Add membership_type_id column to membership table
ALTER TABLE "membership" ADD COLUMN "membership_type_id" text;
--> statement-breakpoint

-- Migrate existing data (map Finnish names to type IDs)
UPDATE "membership" SET "membership_type_id" = 'varsinainen-jasen' WHERE LOWER("type") = 'varsinainen jäsen';
UPDATE "membership" SET "membership_type_id" = 'ulkojasen' WHERE LOWER("type") = 'ulkojäsen';
UPDATE "membership" SET "membership_type_id" = 'kannatusjasen' WHERE LOWER("type") = 'kannatusjäsen';
--> statement-breakpoint

-- Make membership_type_id NOT NULL
ALTER TABLE "membership" ALTER COLUMN "membership_type_id" SET NOT NULL;
--> statement-breakpoint

-- Add foreign key constraint
ALTER TABLE "membership" ADD CONSTRAINT "membership_membership_type_id_membership_type_id_fk"
	FOREIGN KEY ("membership_type_id") REFERENCES "public"."membership_type"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Add timestamps to membership table if they don't exist yet
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='membership' AND column_name='created_at') THEN
        ALTER TABLE "membership" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='membership' AND column_name='updated_at') THEN
        ALTER TABLE "membership" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
    END IF;
END $$;
--> statement-breakpoint

-- Drop old type column
ALTER TABLE "membership" DROP COLUMN IF EXISTS "type";
