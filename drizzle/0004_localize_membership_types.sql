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

-- Dynamically create membership types from existing memberships
DO $$
DECLARE
    membership_type_record RECORD;
    generated_id text;
BEGIN
    -- Loop through unique membership types
    FOR membership_type_record IN
        SELECT DISTINCT type FROM membership WHERE type IS NOT NULL ORDER BY type
    LOOP
        -- Generate a URL-friendly ID from the type name
        -- Convert to lowercase, remove special chars, replace spaces with hyphens
        generated_id := lower(regexp_replace(
            regexp_replace(membership_type_record.type, '[^a-zA-Z0-9\s-]', '', 'g'),
            '\s+', '-', 'g'
        ));

        -- Remove leading/trailing hyphens
        generated_id := trim(both '-' from generated_id);

        -- Insert membership type (using Finnish name for both languages initially)
        -- Descriptions left empty for manual addition later
        INSERT INTO membership_type (id, name_fi, name_en, description_fi, description_en)
        VALUES (
            generated_id,
            membership_type_record.type,  -- Finnish name
            membership_type_record.type,  -- English name (same as Finnish for now)
            NULL,                          -- Empty description
            NULL                           -- Empty description
        )
        ON CONFLICT (id) DO NOTHING;  -- Skip if ID already exists

        RAISE NOTICE 'Created membership type: % (id: %)', membership_type_record.type, generated_id;
    END LOOP;
END $$;
--> statement-breakpoint

-- Add membership_type_id column to membership table
ALTER TABLE "membership" ADD COLUMN "membership_type_id" text;
--> statement-breakpoint

-- Populate membership_type_id based on existing type names
DO $$
DECLARE
    membership_record RECORD;
    generated_id text;
BEGIN
    FOR membership_record IN
        SELECT id, type FROM membership WHERE type IS NOT NULL
    LOOP
        -- Generate the same ID format as above
        generated_id := lower(regexp_replace(
            regexp_replace(membership_record.type, '[^a-zA-Z0-9\s-]', '', 'g'),
            '\s+', '-', 'g'
        ));
        generated_id := trim(both '-' from generated_id);

        -- Update membership to reference the type
        UPDATE membership
        SET membership_type_id = generated_id
        WHERE id = membership_record.id;
    END LOOP;

    RAISE NOTICE 'Migrated all memberships to use membership_type_id';
END $$;
--> statement-breakpoint

-- Make membership_type_id NOT NULL (all should be populated now)
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
