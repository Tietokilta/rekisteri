ALTER TABLE "user" ADD COLUMN "preferred_name" text;--> statement-breakpoint
UPDATE "user" SET "preferred_name" = split_part("first_names", ' ', 1) WHERE "first_names" IS NOT NULL;
