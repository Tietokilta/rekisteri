ALTER TABLE "membership" ALTER COLUMN "stripe_price_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" DROP COLUMN "price_cents";