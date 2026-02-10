ALTER TABLE "user" ADD COLUMN "qr_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_qrToken_unique" UNIQUE("qr_token");