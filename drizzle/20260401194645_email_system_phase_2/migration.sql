CREATE TABLE "email_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email_type" text NOT NULL,
	"related_member_id" text,
	"status" text NOT NULL,
	"mailgun_message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "payment_due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_related_member_id_member_id_fk" FOREIGN KEY ("related_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_log_user_id" ON "email_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_email_log_type_member" ON "email_log" USING btree ("email_type","related_member_id");
