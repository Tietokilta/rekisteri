ALTER TABLE "user" ADD COLUMN "attendance_qr_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_attendanceQrToken_unique" UNIQUE("attendance_qr_token");