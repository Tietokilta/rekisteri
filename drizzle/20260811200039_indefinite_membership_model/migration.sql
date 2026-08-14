CREATE TYPE "membership_event_certainty" AS ENUM('confirmed', 'inferred');--> statement-breakpoint
CREATE TYPE "membership_event_source" AS ENUM('admin', 'system', 'imported', 'migration');--> statement-breakpoint
CREATE TYPE "membership_event_type" AS ENUM('application_submitted', 'application_approved', 'application_rejected', 'type_change_requested', 'type_changed', 'type_change_rejected', 'resigned_voluntarily', 'deemed_resigned_nonpayment', 'expelled', 'legacy_membership_started_inferred', 'legacy_resignation_inferred', 'legacy_rejoin_inferred', 'legacy_type_changed_inferred', 'membership_decision_corrected');--> statement-breakpoint
CREATE TYPE "membership_obligation_disposition" AS ENUM('required', 'waived', 'cancelled');--> statement-breakpoint
CREATE TYPE "membership_obligation_kind" AS ENUM('renewal', 'application', 'type_change');--> statement-breakpoint
CREATE TYPE "payment_refund_reason" AS ENUM('application_rejected', 'type_change_rejected', 'duplicate_payment', 'obsolete_obligation', 'other');--> statement-breakpoint
CREATE TYPE "payment_source" AS ENUM('stripe', 'manual', 'imported');--> statement-breakpoint
CREATE TYPE "payment_status" AS ENUM('pending', 'succeeded', 'failed', 'expired');--> statement-breakpoint

CREATE TABLE "membership_event" (
	"id" text PRIMARY KEY,
	"member_id" text NOT NULL,
	"event_type" "membership_event_type" NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "membership_event_source" NOT NULL,
	"certainty" "membership_event_certainty" NOT NULL,
	"actor_user_id" text,
	"related_event_id" text,
	"membership_fee_period_id" text,
	"data" jsonb NOT NULL,
	CONSTRAINT "membership_event_inferred_provenance" CHECK ("certainty" <> 'inferred' OR "source" IN ('imported', 'migration')),
	CONSTRAINT "membership_event_type_certainty" CHECK (("event_type" IN ('legacy_membership_started_inferred', 'legacy_resignation_inferred', 'legacy_rejoin_inferred', 'legacy_type_changed_inferred') AND "certainty" = 'inferred') OR ("event_type" NOT IN ('legacy_membership_started_inferred', 'legacy_resignation_inferred', 'legacy_rejoin_inferred', 'legacy_type_changed_inferred') AND "certainty" = 'confirmed')),
	CONSTRAINT "membership_event_correction_reference" CHECK ("event_type" <> 'membership_decision_corrected' OR "related_event_id" IS NOT NULL)
);--> statement-breakpoint

CREATE TABLE "membership_obligation" (
	"id" text PRIMARY KEY,
	"member_id" text NOT NULL,
	"membership_fee_period_id" text NOT NULL,
	"kind" "membership_obligation_kind" NOT NULL,
	"disposition" "membership_obligation_disposition" DEFAULT 'required'::"membership_obligation_disposition" NOT NULL,
	"disposition_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_obligation_member_period_unique" UNIQUE("member_id","membership_fee_period_id"),
	CONSTRAINT "membership_obligation_payment_target_unique" UNIQUE("id","member_id","membership_fee_period_id"),
	CONSTRAINT "membership_obligation_waiver_reason" CHECK ("disposition" <> 'waived' OR "disposition_reason" IS NOT NULL)
);--> statement-breakpoint

CREATE TABLE "payment" (
	"id" text PRIMARY KEY,
	"member_id" text NOT NULL,
	"membership_fee_period_id" text NOT NULL,
	"obligation_id" text,
	"source" "payment_source" NOT NULL,
	"status" "payment_status" NOT NULL,
	"amount" integer,
	"currency" text,
	"paid_at" timestamp with time zone,
	"stripe_session_id" text UNIQUE,
	"stripe_payment_intent_id" text UNIQUE,
	"refund_required_at" timestamp with time zone,
	"refund_reason" "payment_refund_reason",
	"refund_confirmed_at" timestamp with time zone,
	"stripe_refund_id" text UNIQUE,
	"manual_refund_reference" text,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount_nonnegative" CHECK ("amount" IS NULL OR "amount" >= 0),
	CONSTRAINT "payment_refund_reason_required" CHECK ("refund_required_at" IS NULL OR "refund_reason" IS NOT NULL),
	CONSTRAINT "payment_refund_confirmation_requires_request" CHECK ("refund_confirmed_at" IS NULL OR "refund_required_at" IS NOT NULL),
	CONSTRAINT "payment_manual_refund_reference" CHECK ("refund_confirmed_at" IS NULL OR "source" = 'stripe' OR "manual_refund_reference" IS NOT NULL),
	CONSTRAINT "payment_invalidation_reason" CHECK ("invalidated_at" IS NULL OR "invalidation_reason" IS NOT NULL)
);--> statement-breakpoint

-- Preserve all legacy evidence before changing or collapsing its tables.
ALTER TABLE "membership" RENAME TO "membership_fee_period";--> statement-breakpoint
ALTER TABLE "member" DROP CONSTRAINT "member_membership_id_membership_id_fk";--> statement-breakpoint
ALTER TABLE "member" RENAME COLUMN "description" TO "application_motive";--> statement-breakpoint
ALTER TABLE "membership_fee_period" RENAME COLUMN "start_time" TO "start_date";--> statement-breakpoint
ALTER TABLE "membership_fee_period" RENAME COLUMN "end_time" TO "end_date";--> statement-breakpoint

CREATE TEMP TABLE "migration_legacy_member" ON COMMIT DROP AS
SELECT
	m."id" AS "old_member_id",
	m."user_id",
	m."organization_name",
	COALESCE('user:' || m."user_id", 'organization:' || m."organization_name") AS "identity_key",
	m."membership_id" AS "membership_fee_period_id",
	p."membership_type_id",
	p."stripe_price_id",
	p."start_date" AS "period_start_time",
	p."end_date" AS "period_end_time",
	p."requires_student_verification",
	m."status"::text AS "legacy_status",
	m."stripe_session_id",
	m."application_motive",
	m."created_at",
	m."updated_at"
FROM "member" m
INNER JOIN "membership_fee_period" p ON p."id" = m."membership_id";--> statement-breakpoint

CREATE TEMP TABLE "migration_member_map" ON COMMIT DROP AS
SELECT
	"old_member_id",
	"identity_key",
	FIRST_VALUE("old_member_id") OVER (
		PARTITION BY "identity_key"
		ORDER BY "period_start_time" DESC, "created_at" DESC, "old_member_id" DESC
	) AS "stable_member_id"
FROM "migration_legacy_member";--> statement-breakpoint

CREATE UNIQUE INDEX "migration_member_map_old_member_unique"
	ON "migration_member_map" ("old_member_id");--> statement-breakpoint

CREATE TEMP TABLE "migration_member_audit" ON COMMIT DROP AS
SELECT
	a."id" AS "audit_id",
	a."action",
	a."user_id" AS "actor_user_id",
	a."metadata"::jsonb AS "metadata",
	a."created_at",
	TRIM(target."old_member_id") AS "old_member_id",
	map."stable_member_id",
	target."ordinality"
FROM "audit_log" a
CROSS JOIN LATERAL UNNEST(string_to_array(a."target_id", ',')) WITH ORDINALITY
	AS target("old_member_id", "ordinality")
INNER JOIN "migration_member_map" map ON map."old_member_id" = TRIM(target."old_member_id")
WHERE a."target_type" = 'member';--> statement-breakpoint

-- Refuse to guess about cases that require explicit rehearsal classification.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "migration_legacy_member" left_row
		INNER JOIN "migration_legacy_member" right_row
			ON left_row."identity_key" = right_row."identity_key"
			AND left_row."old_member_id" < right_row."old_member_id"
			AND left_row."membership_type_id" <> right_row."membership_type_id"
			AND left_row."legacy_status" IN ('active', 'resigned')
			AND right_row."legacy_status" IN ('active', 'resigned')
			AND left_row."period_start_time" <= right_row."period_end_time"
			AND right_row."period_start_time" <= left_row."period_end_time"
	) THEN
		RAISE EXCEPTION 'membership migration: overlapping approved membership types require manual classification';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "migration_legacy_member"
		WHERE "stripe_session_id" IS NOT NULL
		GROUP BY "stripe_session_id"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'membership migration: duplicate Stripe session IDs require manual classification';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "migration_member_audit" WHERE "action" IN ('member.reactivate', 'member.bulk_reactivate')
	) THEN
		RAISE EXCEPTION 'membership migration: legacy reactivation actions require manual classification';
	END IF;
END $$;--> statement-breakpoint

DROP INDEX "member_user_id_idx";--> statement-breakpoint
DROP INDEX "member_membership_id_idx";--> statement-breakpoint
DROP INDEX "membership_type_start_unique";--> statement-breakpoint

ALTER TABLE "app_customization" ADD COLUMN "membership_data_live_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "membership_type_id" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "pending_membership_type_id" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "current_membership_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "current_membership_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD COLUMN "non_payment_action_at" date;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD COLUMN "amount" integer;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD COLUMN "accepts_applications" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD COLUMN "created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_type" ADD COLUMN "requires_payment" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_type" ADD COLUMN "requires_student_verification" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_type" ADD COLUMN "legacy_inference_through_period_id" text;--> statement-breakpoint

ALTER TABLE "membership_fee_period"
	ALTER COLUMN "start_date" SET DATA TYPE date
	USING ("start_date" AT TIME ZONE 'Europe/Helsinki')::date;--> statement-breakpoint
ALTER TABLE "membership_fee_period"
	ALTER COLUMN "end_date" SET DATA TYPE date
	USING ("end_date" AT TIME ZONE 'Europe/Helsinki')::date;--> statement-breakpoint

UPDATE "membership_fee_period" period
SET
	"due_date" = make_date(EXTRACT(YEAR FROM period."start_date")::integer, 9, 30),
	"non_payment_action_at" = make_date(EXTRACT(YEAR FROM period."start_date")::integer, 12, 1),
	"created_at" = legacy."period_start_time",
	"updated_at" = legacy."period_start_time"
FROM (
	SELECT DISTINCT ON ("membership_fee_period_id")
		"membership_fee_period_id", "period_start_time"
	FROM "migration_legacy_member"
	ORDER BY "membership_fee_period_id", "period_start_time"
) legacy
WHERE legacy."membership_fee_period_id" = period."id";--> statement-breakpoint

UPDATE "membership_fee_period"
SET
	"due_date" = make_date(EXTRACT(YEAR FROM "start_date")::integer, 9, 30),
	"non_payment_action_at" = make_date(EXTRACT(YEAR FROM "start_date")::integer, 12, 1),
	"created_at" = ("start_date"::timestamp AT TIME ZONE 'Europe/Helsinki'),
	"updated_at" = ("start_date"::timestamp AT TIME ZONE 'Europe/Helsinki')
WHERE "due_date" IS NULL;--> statement-breakpoint

ALTER TABLE "membership_fee_period" ALTER COLUMN "due_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ALTER COLUMN "non_payment_action_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "membership_fee_period" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_fee_period" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "membership_fee_period" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint

UPDATE "membership_type" type
SET
	"requires_payment" = EXISTS (
		SELECT 1 FROM "membership_fee_period" period
		WHERE period."membership_type_id" = type."id" AND period."stripe_price_id" IS NOT NULL
	),
	"requires_student_verification" = EXISTS (
		SELECT 1 FROM "migration_legacy_member" legacy
		WHERE legacy."membership_type_id" = type."id" AND legacy."requires_student_verification"
	);--> statement-breakpoint

UPDATE "membership_type" type
SET "legacy_inference_through_period_id" = cutoff."id"
FROM (
	SELECT DISTINCT ON ("membership_type_id") "membership_type_id", "id"
	FROM "membership_fee_period"
	WHERE "due_date" < DATE '2026-08-11'
	ORDER BY "membership_type_id", "start_date" DESC, "id" DESC
) cutoff
WHERE cutoff."membership_type_id" = type."id";--> statement-breakpoint

-- Retain each real or inferred payment attempt without inventing a completion time.
INSERT INTO "payment" (
	"id", "member_id", "membership_fee_period_id", "obligation_id", "source", "status",
	"amount", "currency", "paid_at", "stripe_session_id", "created_at", "updated_at"
)
SELECT
	'migration-payment-' || legacy."old_member_id",
	map."stable_member_id",
	legacy."membership_fee_period_id",
	NULL,
	CASE WHEN legacy."stripe_session_id" IS NOT NULL THEN 'stripe'::"payment_source" ELSE 'imported'::"payment_source" END,
	CASE
		WHEN legacy."legacy_status" = 'awaiting_payment' THEN 'pending'::"payment_status"
		WHEN legacy."legacy_status" = 'rejected' AND EXISTS (
			SELECT 1 FROM "migration_member_audit" audit
			WHERE audit."old_member_id" = legacy."old_member_id"
				AND audit."action" IN ('member.reject', 'member.bulk_reject')
				AND audit."metadata"->>'previousStatus' = 'awaiting_approval'
		) THEN 'succeeded'::"payment_status"
		WHEN legacy."legacy_status" = 'rejected' THEN 'expired'::"payment_status"
		ELSE 'succeeded'::"payment_status"
	END,
	NULL,
	NULL,
	NULL,
	legacy."stripe_session_id",
	legacy."created_at",
	legacy."updated_at"
FROM "migration_legacy_member" legacy
INNER JOIN "migration_member_map" map ON map."old_member_id" = legacy."old_member_id"
INNER JOIN "membership_type" type ON type."id" = legacy."membership_type_id"
WHERE type."requires_payment"
	AND (
		legacy."stripe_session_id" IS NOT NULL
		OR legacy."legacy_status" IN ('awaiting_approval', 'active', 'resigned')
	);--> statement-breakpoint

-- Build a deterministic inferred legal-membership timeline from approved legacy evidence.
CREATE TEMP TABLE "migration_approved_timeline" ON COMMIT DROP AS
SELECT
	legacy.*,
	map."stable_member_id",
	LAG(legacy."period_end_time") OVER timeline AS "previous_period_end_time",
	LAG(legacy."membership_type_id") OVER timeline AS "previous_membership_type_id"
FROM "migration_legacy_member" legacy
INNER JOIN "migration_member_map" map ON map."old_member_id" = legacy."old_member_id"
WHERE legacy."legacy_status" IN ('active', 'resigned')
WINDOW timeline AS (
	PARTITION BY legacy."identity_key"
	ORDER BY legacy."period_start_time", legacy."period_end_time", legacy."old_member_id"
);--> statement-breakpoint

ALTER TABLE "migration_approved_timeline" ADD COLUMN "starts_new_segment" boolean;--> statement-breakpoint
UPDATE "migration_approved_timeline"
SET "starts_new_segment" = "previous_period_end_time" IS NULL
	OR "period_start_time" > "previous_period_end_time" + INTERVAL '1 day';--> statement-breakpoint

ALTER TABLE "migration_approved_timeline" ADD COLUMN "segment_number" integer;--> statement-breakpoint
WITH numbered AS (
	SELECT
		"old_member_id",
		SUM(CASE WHEN "starts_new_segment" THEN 1 ELSE 0 END) OVER (
			PARTITION BY "identity_key"
			ORDER BY "period_start_time", "period_end_time", "old_member_id"
		)::integer AS "segment_number"
	FROM "migration_approved_timeline"
)
UPDATE "migration_approved_timeline" timeline
SET "segment_number" = numbered."segment_number"
FROM numbered
WHERE numbered."old_member_id" = timeline."old_member_id";--> statement-breakpoint

INSERT INTO "membership_event" (
	"id", "member_id", "event_type", "effective_at", "recorded_at", "source", "certainty",
	"actor_user_id", "membership_fee_period_id", "data"
)
SELECT
	CASE
		WHEN approval."audit_id" IS NOT NULL
			THEN 'migration-audit-approval-' || approval."audit_id" || '-' || timeline."old_member_id"
		ELSE 'migration-start-' || timeline."old_member_id"
	END,
	timeline."stable_member_id",
	CASE
		WHEN approval."audit_id" IS NOT NULL THEN 'application_approved'::"membership_event_type"
		WHEN timeline."segment_number" = 1 THEN 'legacy_membership_started_inferred'::"membership_event_type"
		ELSE 'legacy_rejoin_inferred'::"membership_event_type"
	END,
	COALESCE(approval."created_at", timeline."period_start_time"),
	COALESCE(approval."created_at", timeline."created_at"),
	'migration'::"membership_event_source",
	CASE
		WHEN approval."audit_id" IS NOT NULL THEN 'confirmed'::"membership_event_certainty"
		ELSE 'inferred'::"membership_event_certainty"
	END,
	approval."actor_user_id",
	timeline."membership_fee_period_id",
	jsonb_build_object('membershipTypeId', timeline."membership_type_id")
FROM "migration_approved_timeline" timeline
LEFT JOIN LATERAL (
	SELECT audit.*
	FROM "migration_member_audit" audit
	WHERE audit."old_member_id" = timeline."old_member_id"
		AND audit."action" IN ('member.approve', 'member.bulk_approve')
	ORDER BY audit."created_at", audit."audit_id"
	LIMIT 1
) approval ON true
WHERE timeline."starts_new_segment";--> statement-breakpoint

INSERT INTO "membership_event" (
	"id", "member_id", "event_type", "effective_at", "recorded_at", "source", "certainty", "data"
)
SELECT
	'migration-gap-end-' || timeline."old_member_id",
	timeline."stable_member_id",
	'legacy_resignation_inferred',
	make_timestamptz(
		EXTRACT(YEAR FROM timeline."previous_period_end_time" + INTERVAL '1 day')::integer,
		12, 1, 0, 0, 0, 'Europe/Helsinki'
	),
	timeline."created_at",
	'migration',
	'inferred',
	jsonb_build_object('reason', 'Missing legacy fee period')
FROM "migration_approved_timeline" timeline
WHERE timeline."starts_new_segment" AND timeline."previous_period_end_time" IS NOT NULL;--> statement-breakpoint

INSERT INTO "membership_event" (
	"id", "member_id", "event_type", "effective_at", "recorded_at", "source", "certainty",
	"actor_user_id", "membership_fee_period_id", "data"
)
SELECT
	CASE
		WHEN approval."audit_id" IS NOT NULL
			THEN 'migration-audit-type-change-' || approval."audit_id" || '-' || timeline."old_member_id"
		ELSE 'migration-type-change-' || timeline."old_member_id"
	END,
	timeline."stable_member_id",
	CASE
		WHEN approval."audit_id" IS NOT NULL THEN 'type_changed'::"membership_event_type"
		ELSE 'legacy_type_changed_inferred'::"membership_event_type"
	END,
	COALESCE(approval."created_at", timeline."period_start_time"),
	COALESCE(approval."created_at", timeline."created_at"),
	'migration',
	CASE
		WHEN approval."audit_id" IS NOT NULL THEN 'confirmed'::"membership_event_certainty"
		ELSE 'inferred'::"membership_event_certainty"
	END,
	approval."actor_user_id",
	timeline."membership_fee_period_id",
	jsonb_build_object(
		'fromMembershipTypeId', timeline."previous_membership_type_id",
		'toMembershipTypeId', timeline."membership_type_id"
	)
FROM "migration_approved_timeline" timeline
LEFT JOIN LATERAL (
	SELECT audit.*
	FROM "migration_member_audit" audit
	WHERE audit."old_member_id" = timeline."old_member_id"
		AND audit."action" IN ('member.approve', 'member.bulk_approve')
	ORDER BY audit."created_at", audit."audit_id"
	LIMIT 1
) approval ON true
WHERE NOT timeline."starts_new_segment"
	AND timeline."previous_membership_type_id" <> timeline."membership_type_id";--> statement-breakpoint

-- Confirm ending decisions when audit evidence exists.
WITH latest_approved AS (
	SELECT DISTINCT ON ("identity_key") *
	FROM "migration_approved_timeline"
	ORDER BY "identity_key", "period_start_time" DESC, "created_at" DESC, "old_member_id" DESC
), ending_audit AS (
	SELECT DISTINCT ON (audit."old_member_id") audit.*
	FROM "migration_member_audit" audit
	WHERE audit."action" IN (
		'member.resign', 'member.bulk_resign', 'member.deem_resigned', 'member.bulk_deem_resigned'
	)
	ORDER BY audit."old_member_id", audit."created_at" DESC, audit."audit_id" DESC
)
INSERT INTO "membership_event" (
	"id", "member_id", "event_type", "effective_at", "recorded_at", "source", "certainty",
	"actor_user_id", "membership_fee_period_id", "data"
)
SELECT
	'migration-audit-end-' || audit."audit_id" || '-' || latest."old_member_id",
	latest."stable_member_id",
	CASE
		WHEN audit."action" IN ('member.resign', 'member.bulk_resign')
			THEN 'resigned_voluntarily'::"membership_event_type"
		ELSE 'deemed_resigned_nonpayment'::"membership_event_type"
	END,
	audit."created_at",
	audit."created_at",
	'migration',
	'confirmed',
	audit."actor_user_id",
	latest."membership_fee_period_id",
	jsonb_build_object('reason', COALESCE(audit."metadata"->>'reason', 'Migrated confirmed board action'))
FROM latest_approved latest
INNER JOIN ending_audit audit ON audit."old_member_id" = latest."old_member_id"
WHERE latest."legacy_status" = 'resigned';--> statement-breakpoint

WITH latest_approved AS (
	SELECT DISTINCT ON ("identity_key") *
	FROM "migration_approved_timeline"
	ORDER BY "identity_key", "period_start_time" DESC, "created_at" DESC, "old_member_id" DESC
)
INSERT INTO "membership_event" (
	"id", "member_id", "event_type", "effective_at", "recorded_at", "source", "certainty",
	"membership_fee_period_id", "data"
)
SELECT
	'migration-final-end-' || latest."old_member_id",
	latest."stable_member_id",
	'legacy_resignation_inferred',
	latest."updated_at",
	latest."updated_at",
	'migration',
	'inferred',
	latest."membership_fee_period_id",
	jsonb_build_object('reason', 'Legacy member row was resigned without a retained decision timestamp')
FROM latest_approved latest
WHERE latest."legacy_status" = 'resigned'
	AND NOT EXISTS (
		SELECT 1 FROM "migration_member_audit" audit
		WHERE audit."old_member_id" = latest."old_member_id"
			AND audit."action" IN (
				'member.resign', 'member.bulk_resign', 'member.deem_resigned', 'member.bulk_deem_resigned'
			)
	);--> statement-breakpoint

-- Materialize one current snapshot per identity while retaining the latest legacy ID.
ALTER TABLE "member" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "member_status";--> statement-breakpoint

CREATE TEMP TABLE "migration_member_snapshot" ON COMMIT DROP AS
WITH latest_row AS (
	SELECT DISTINCT ON (legacy."identity_key") legacy.*, map."stable_member_id"
	FROM "migration_legacy_member" legacy
	INNER JOIN "migration_member_map" map ON map."old_member_id" = legacy."old_member_id"
	ORDER BY legacy."identity_key", legacy."period_start_time" DESC, legacy."created_at" DESC, legacy."old_member_id" DESC
), latest_approved AS (
	SELECT DISTINCT ON ("identity_key") *
	FROM "migration_approved_timeline"
	ORDER BY "identity_key", "period_start_time" DESC, "created_at" DESC, "old_member_id" DESC
), current_segment AS (
	SELECT timeline."identity_key", MIN(timeline."period_start_time") AS "started_at"
	FROM "migration_approved_timeline" timeline
	INNER JOIN (
		SELECT "identity_key", MAX("segment_number") AS "segment_number"
		FROM "migration_approved_timeline"
		GROUP BY "identity_key"
	) latest_segment
		ON latest_segment."identity_key" = timeline."identity_key"
		AND latest_segment."segment_number" = timeline."segment_number"
	GROUP BY timeline."identity_key"
), ending_audit AS (
	SELECT DISTINCT ON (audit."stable_member_id") audit."stable_member_id", audit."created_at"
	FROM "migration_member_audit" audit
	WHERE audit."action" IN (
		'member.resign', 'member.bulk_resign', 'member.deem_resigned', 'member.bulk_deem_resigned'
	)
	ORDER BY audit."stable_member_id", audit."created_at" DESC, audit."audit_id" DESC
), identity_times AS (
	SELECT
		"identity_key",
		MIN("created_at") AS "created_at",
		MAX("updated_at") AS "updated_at"
	FROM "migration_legacy_member"
	GROUP BY "identity_key"
)
SELECT
	latest."identity_key",
	latest."stable_member_id",
	CASE
		WHEN approved."old_member_id" IS NOT NULL AND approved."legacy_status" = 'resigned' THEN 'ended'
		WHEN approved."old_member_id" IS NOT NULL THEN 'active'
		WHEN latest."legacy_status" = 'resigned' THEN 'ended'
		ELSE latest."legacy_status"
	END AS "status",
	approved."membership_type_id",
	CASE
		WHEN approved."old_member_id" IS NULL AND latest."legacy_status" IN ('awaiting_payment', 'awaiting_approval')
			THEN latest."membership_type_id"
		WHEN approved."old_member_id" IS NOT NULL
			AND latest."legacy_status" IN ('awaiting_payment', 'awaiting_approval')
			AND latest."membership_type_id" <> approved."membership_type_id"
			THEN latest."membership_type_id"
		ELSE NULL
	END AS "pending_membership_type_id",
	segment."started_at" AS "current_membership_started_at",
	CASE
		WHEN approved."legacy_status" = 'resigned' THEN COALESCE(ending."created_at", approved."updated_at")
		ELSE NULL
	END AS "current_membership_ended_at",
	latest."application_motive",
	times."created_at",
	times."updated_at"
FROM latest_row latest
LEFT JOIN latest_approved approved ON approved."identity_key" = latest."identity_key"
LEFT JOIN current_segment segment ON segment."identity_key" = latest."identity_key"
LEFT JOIN ending_audit ending ON ending."stable_member_id" = latest."stable_member_id"
INNER JOIN identity_times times ON times."identity_key" = latest."identity_key";--> statement-breakpoint

UPDATE "member" member
SET
	"status" = snapshot."status",
	"membership_type_id" = snapshot."membership_type_id",
	"pending_membership_type_id" = snapshot."pending_membership_type_id",
	"current_membership_started_at" = snapshot."current_membership_started_at",
	"current_membership_ended_at" = snapshot."current_membership_ended_at",
	"application_motive" = snapshot."application_motive",
	"created_at" = snapshot."created_at",
	"updated_at" = snapshot."updated_at"
FROM "migration_member_snapshot" snapshot
WHERE snapshot."stable_member_id" = member."id";--> statement-breakpoint

-- Repoint both scalar and bulk audit targets before duplicate period-shaped rows disappear.
WITH deduplicated AS (
	SELECT "audit_id", "stable_member_id", MIN("ordinality") AS "ordinality"
	FROM "migration_member_audit"
	GROUP BY "audit_id", "stable_member_id"
), remapped AS (
	SELECT "audit_id", string_agg("stable_member_id", ',' ORDER BY "ordinality") AS "target_id"
	FROM deduplicated
	GROUP BY "audit_id"
)
UPDATE "audit_log" audit
SET "target_id" = remapped."target_id"
FROM remapped
WHERE remapped."audit_id" = audit."id";--> statement-breakpoint

WITH deduplicated AS (
	SELECT "audit_id", "stable_member_id", MIN("ordinality") AS "ordinality"
	FROM "migration_member_audit"
	GROUP BY "audit_id", "stable_member_id"
), remapped AS (
	SELECT "audit_id", jsonb_agg("stable_member_id" ORDER BY "ordinality") AS "member_ids"
	FROM deduplicated
	GROUP BY "audit_id"
)
UPDATE "audit_log" audit
SET "metadata" = jsonb_set(audit."metadata"::jsonb, '{memberIds}', remapped."member_ids")::json
FROM remapped
WHERE remapped."audit_id" = audit."id"
	AND audit."metadata" IS NOT NULL
	AND audit."metadata"::jsonb ? 'memberIds';--> statement-breakpoint

DELETE FROM "member" member
USING "migration_member_map" map
WHERE member."id" = map."old_member_id" AND map."old_member_id" <> map."stable_member_id";--> statement-breakpoint

UPDATE "app_customization"
SET "membership_data_live_at" = now()
WHERE EXISTS (SELECT 1 FROM "migration_legacy_member");--> statement-breakpoint

-- Abort before removing legacy columns if any preservation invariant failed.
DO $$
DECLARE
	legacy_identity_count bigint;
	stable_member_count bigint;
BEGIN
	SELECT COUNT(DISTINCT "identity_key") INTO legacy_identity_count FROM "migration_legacy_member";
	SELECT COUNT(*) INTO stable_member_count
	FROM "member" member
	WHERE EXISTS (
		SELECT 1 FROM "migration_member_map" map WHERE map."stable_member_id" = member."id"
	);

	IF stable_member_count <> legacy_identity_count THEN
		RAISE EXCEPTION 'membership migration: stable member count mismatch (% vs %)', stable_member_count, legacy_identity_count;
	END IF;

	IF EXISTS (
		SELECT 1 FROM "migration_legacy_member" legacy
		WHERE legacy."stripe_session_id" IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 FROM "payment" payment
				WHERE payment."stripe_session_id" = legacy."stripe_session_id"
			)
	) THEN
		RAISE EXCEPTION 'membership migration: a Stripe session was not preserved';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "member"
		WHERE "status" = 'active'
			AND ("membership_type_id" IS NULL OR "current_membership_started_at" IS NULL)
	) THEN
		RAISE EXCEPTION 'membership migration: active member snapshot is incomplete';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "member"
		WHERE "status" IN ('awaiting_payment', 'awaiting_approval')
			AND "pending_membership_type_id" IS NULL
	) THEN
		RAISE EXCEPTION 'membership migration: pending member snapshot has no target type';
	END IF;
END $$;--> statement-breakpoint

ALTER TABLE "member" DROP COLUMN "membership_id";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "stripe_session_id";--> statement-breakpoint
ALTER TABLE "membership_fee_period" DROP COLUMN "requires_student_verification";--> statement-breakpoint

CREATE TYPE "member_status" AS ENUM('awaiting_payment', 'awaiting_approval', 'active', 'ended', 'rejected');--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "status" SET DATA TYPE "member_status" USING "status"::"member_status";--> statement-breakpoint

ALTER TABLE "membership_fee_period" ADD CONSTRAINT "membership_fee_period_type_start_unique" UNIQUE("membership_type_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "member_user_id_unique" ON "member" ("user_id");--> statement-breakpoint
CREATE INDEX "member_membership_type_idx" ON "member" ("membership_type_id");--> statement-breakpoint
CREATE INDEX "member_pending_membership_type_idx" ON "member" ("pending_membership_type_id");--> statement-breakpoint
CREATE INDEX "membership_event_member_timeline_idx" ON "membership_event" ("member_id","effective_at","recorded_at");--> statement-breakpoint
CREATE INDEX "membership_event_actor_idx" ON "membership_event" ("actor_user_id");--> statement-breakpoint
CREATE INDEX "membership_event_fee_period_idx" ON "membership_event" ("membership_fee_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_fee_period_application_target_unique" ON "membership_fee_period" ("membership_type_id") WHERE "accepts_applications";--> statement-breakpoint
CREATE INDEX "membership_fee_period_type_idx" ON "membership_fee_period" ("membership_type_id");--> statement-breakpoint
CREATE INDEX "membership_obligation_disposition_idx" ON "membership_obligation" ("disposition");--> statement-breakpoint
CREATE INDEX "membership_type_legacy_inference_period_idx" ON "membership_type" ("legacy_inference_through_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_pending_obligation_unique" ON "payment" ("obligation_id") WHERE "status" = 'pending' AND "obligation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_member_idx" ON "payment" ("member_id");--> statement-breakpoint
CREATE INDEX "payment_fee_period_idx" ON "payment" ("membership_fee_period_id");--> statement-breakpoint
CREATE INDEX "payment_refund_required_idx" ON "payment" ("refund_required_at");--> statement-breakpoint

ALTER TABLE "member" ADD CONSTRAINT "member_membership_type_id_membership_type_id_fkey" FOREIGN KEY ("membership_type_id") REFERENCES "membership_type"("id");--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_pending_membership_type_id_membership_type_id_fkey" FOREIGN KEY ("pending_membership_type_id") REFERENCES "membership_type"("id");--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id");--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_related_event_id_membership_event_id_fkey" FOREIGN KEY ("related_event_id") REFERENCES "membership_event"("id");--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_Ca7xktzQIRm3_fkey" FOREIGN KEY ("membership_fee_period_id") REFERENCES "membership_fee_period"("id");--> statement-breakpoint
ALTER TABLE "membership_obligation" ADD CONSTRAINT "membership_obligation_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id");--> statement-breakpoint
ALTER TABLE "membership_obligation" ADD CONSTRAINT "membership_obligation_LPmb4RkdCykl_fkey" FOREIGN KEY ("membership_fee_period_id") REFERENCES "membership_fee_period"("id");--> statement-breakpoint
ALTER TABLE "membership_type" ADD CONSTRAINT "membership_type_AM8nkn2jwkQH_fkey" FOREIGN KEY ("legacy_inference_through_period_id") REFERENCES "membership_fee_period"("id");--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id");--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_membership_fee_period_id_membership_fee_period_id_fkey" FOREIGN KEY ("membership_fee_period_id") REFERENCES "membership_fee_period"("id");--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_obligation_member_period_fk" FOREIGN KEY ("obligation_id","member_id","membership_fee_period_id") REFERENCES "membership_obligation"("id","member_id","membership_fee_period_id");--> statement-breakpoint

ALTER TABLE "member" ADD CONSTRAINT "member_membership_date_order" CHECK ("current_membership_ended_at" IS NULL OR ("current_membership_started_at" IS NOT NULL AND "current_membership_ended_at" >= "current_membership_started_at"));--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_active_snapshot" CHECK ("status" <> 'active' OR ("membership_type_id" IS NOT NULL AND "current_membership_started_at" IS NOT NULL AND "current_membership_ended_at" IS NULL));--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_ended_snapshot" CHECK ("status" <> 'ended' OR ("membership_type_id" IS NOT NULL AND "current_membership_started_at" IS NOT NULL AND "current_membership_ended_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_pending_application_type" CHECK ("status" NOT IN ('awaiting_payment', 'awaiting_approval') OR "pending_membership_type_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD CONSTRAINT "membership_fee_period_date_order" CHECK ("end_date" >= "start_date");--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD CONSTRAINT "membership_fee_period_action_after_due" CHECK ("non_payment_action_at" > "due_date");--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD CONSTRAINT "membership_fee_period_amount_nonnegative" CHECK ("amount" IS NULL OR "amount" >= 0);--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD CONSTRAINT "membership_fee_period_published_complete" CHECK ("published_at" IS NULL OR ("amount" IS NOT NULL AND "currency" IS NOT NULL AND ("amount" = 0 OR "stripe_price_id" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "membership_fee_period" ADD CONSTRAINT "membership_fee_period_application_target_published" CHECK (NOT "accepts_applications" OR "published_at" IS NOT NULL);
