CREATE TABLE "membership_type" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Insert initial membership types
INSERT INTO "membership_type" ("id", "name", "description") VALUES
	('varsinainen-jasen', '{"fi": "Varsinainen jäsen", "en": "Regular member"}', '{"fi": "Aalto-yliopiston tietotekniikan opiskelijoille", "en": "For computer science students at Aalto University"}'),
	('ulkojasen', '{"fi": "Ulkojäsen", "en": "External member"}', '{"fi": "Muille kuin Aalto-yliopiston tietotekniikan opiskelijoille", "en": "For non-Aalto CS students"}'),
	('kannatusjasen', '{"fi": "Kannatusjäsen", "en": "Supporting member"}', '{"fi": "Tukee Tietokillan toimintaa", "en": "Supports Tietokilta''s activities"}');
--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "membership_type_id" text;
--> statement-breakpoint
-- Map existing type values to membership_type_id
UPDATE "membership" SET "membership_type_id" =
	CASE
		WHEN LOWER("type") LIKE '%varsinainen%' OR LOWER("type") LIKE '%regular%' THEN 'varsinainen-jasen'
		WHEN LOWER("type") LIKE '%ulko%' OR LOWER("type") LIKE '%external%' THEN 'ulkojasen'
		WHEN LOWER("type") LIKE '%kannatus%' OR LOWER("type") LIKE '%supporting%' THEN 'kannatusjasen'
		ELSE 'varsinainen-jasen'
	END;
--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "membership_type_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_membership_type_id_membership_type_id_fk" FOREIGN KEY ("membership_type_id") REFERENCES "public"."membership_type"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "membership" DROP COLUMN "type";
