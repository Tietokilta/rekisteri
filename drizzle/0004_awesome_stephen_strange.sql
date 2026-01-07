CREATE TABLE "secondary_email" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"domain" text NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secondary_email_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "secondary_email" ADD CONSTRAINT "secondary_email_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_secondary_email_user_id" ON "secondary_email" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_secondary_email_domain" ON "secondary_email" USING btree ("domain");