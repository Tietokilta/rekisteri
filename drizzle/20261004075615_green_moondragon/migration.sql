CREATE TABLE "meeting" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"scheduled_starts_at" timestamp with time zone,
	"starts_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_attendance_event" (
	"id" text PRIMARY KEY,
	"meeting_id" text NOT NULL,
	"attendee_id" text NOT NULL,
	"actor_id" text,
	"direction" text NOT NULL,
	"source" text NOT NULL,
	"membership_type_id" text,
	"note" text,
	"effective_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_event_direction_check" CHECK ("direction" IN ('in', 'out')),
	CONSTRAINT "meeting_event_source_check" CHECK ("source" IN ('manual', 'scan', 'correction'))
);
--> statement-breakpoint
CREATE TABLE "meeting_attendance_event_correction" (
	"id" text PRIMARY KEY,
	"event_id" text NOT NULL,
	"revision" integer NOT NULL,
	"actor_id" text,
	"attendee_id" text NOT NULL,
	"direction" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"membership_type_id" text,
	"voided" boolean NOT NULL,
	"reason" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_event_correction_direction_check" CHECK ("direction" IN ('in', 'out')),
	CONSTRAINT "meeting_event_correction_reason_check" CHECK (length(trim("reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "meeting_attendee" (
	"id" text PRIMARY KEY,
	"meeting_id" text NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"membership_type_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_recess" (
	"id" text PRIMARY KEY,
	"meeting_id" text NOT NULL,
	"mode" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"started_by" text,
	"ended_by" text,
	"cancelled_by" text,
	CONSTRAINT "meeting_recess_mode_check" CHECK ("mode" IN ('track_exits', 'reset_all')),
	CONSTRAINT "meeting_recess_end_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);
--> statement-breakpoint
CREATE INDEX "meeting_event_meeting_time_idx" ON "meeting_attendance_event" ("meeting_id","effective_at");--> statement-breakpoint
CREATE INDEX "meeting_event_attendee_time_idx" ON "meeting_attendance_event" ("attendee_id","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_event_correction_revision_unique" ON "meeting_attendance_event_correction" ("event_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_attendee_user_unique" ON "meeting_attendee" ("meeting_id","user_id") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "meeting_attendee_meeting_idx" ON "meeting_attendee" ("meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_recess_one_open" ON "meeting_recess" ("meeting_id") WHERE "ended_at" IS NULL AND "cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "meeting_recess_meeting_idx" ON "meeting_recess" ("meeting_id","started_at");--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "meeting_attendance_event" ADD CONSTRAINT "meeting_attendance_event_meeting_id_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id");--> statement-breakpoint
ALTER TABLE "meeting_attendance_event" ADD CONSTRAINT "meeting_attendance_event_attendee_id_meeting_attendee_id_fkey" FOREIGN KEY ("attendee_id") REFERENCES "meeting_attendee"("id");--> statement-breakpoint
ALTER TABLE "meeting_attendance_event" ADD CONSTRAINT "meeting_attendance_event_actor_id_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "meeting_attendance_event_correction" ADD CONSTRAINT "meeting_attendance_event_correction_NmLKN7KoAzGV_fkey" FOREIGN KEY ("event_id") REFERENCES "meeting_attendance_event"("id");--> statement-breakpoint
ALTER TABLE "meeting_attendance_event_correction" ADD CONSTRAINT "meeting_attendance_event_correction_actor_id_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "meeting_attendance_event_correction" ADD CONSTRAINT "meeting_attendance_event_correction_D6anOX8dRxoX_fkey" FOREIGN KEY ("attendee_id") REFERENCES "meeting_attendee"("id");--> statement-breakpoint
ALTER TABLE "meeting_attendee" ADD CONSTRAINT "meeting_attendee_meeting_id_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id");--> statement-breakpoint
ALTER TABLE "meeting_attendee" ADD CONSTRAINT "meeting_attendee_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "meeting_recess" ADD CONSTRAINT "meeting_recess_meeting_id_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id");--> statement-breakpoint
ALTER TABLE "meeting_recess" ADD CONSTRAINT "meeting_recess_started_by_user_id_fkey" FOREIGN KEY ("started_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "meeting_recess" ADD CONSTRAINT "meeting_recess_ended_by_user_id_fkey" FOREIGN KEY ("ended_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "meeting_recess" ADD CONSTRAINT "meeting_recess_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user"("id") ON DELETE SET NULL;