CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_membership_id_idx" ON "member" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "member_status_idx" ON "member" USING btree ("status");