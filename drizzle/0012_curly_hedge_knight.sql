CREATE TYPE "public"."attendance_event_type" AS ENUM('check_in', 'check_out');--> statement-breakpoint
CREATE TYPE "public"."meeting_event_type" AS ENUM('start', 'recess_start', 'recess_end', 'finish');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('upcoming', 'ongoing', 'recess', 'finished');--> statement-breakpoint
CREATE TYPE "public"."scan_method" AS ENUM('qr_scan', 'manual');--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"user_id" text NOT NULL,
	"event_type" "attendance_event_type" NOT NULL,
	"scan_method" "scan_method" NOT NULL,
	"scanned_by" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "meeting_status" DEFAULT 'upcoming' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_event" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"event_type" "meeting_event_type" NOT NULL,
	"notes" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."member_status";--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('awaiting_payment', 'awaiting_approval', 'active', 'expired', 'cancelled');--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "status" SET DATA TYPE "public"."member_status" USING "status"::"public"."member_status";--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_scanned_by_user_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_event" ADD CONSTRAINT "meeting_event_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attendance_meeting_id" ON "attendance" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "idx_attendance_user_id" ON "attendance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_meeting_event_meeting_id" ON "meeting_event" USING btree ("meeting_id");