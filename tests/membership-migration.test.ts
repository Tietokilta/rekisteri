import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copySanitizedDatabase } from "../scripts/rehearse-membership-migration";

const migrations = readMigrationFiles({ migrationsFolder: path.join(process.cwd(), "drizzle") });
const membershipMigrationName = "20260811200039_indefinite_membership_model";
const matchingMembershipMigrations = migrations.filter((migration) => migration.name === membershipMigrationName);

if (matchingMembershipMigrations.length !== 1) {
  throw new Error(
    `Expected exactly one ${membershipMigrationName} migration, found ${matchingMembershipMigrations.length}`,
  );
}

const membershipMigration = matchingMembershipMigrations[0];
if (!membershipMigration) throw new Error("Membership migration is missing");

const membershipMigrationIndex = migrations.indexOf(membershipMigration);
const legacyMigrations = migrations.slice(0, membershipMigrationIndex);

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  expect(membershipMigration.name).toContain("indefinite_membership_model");
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
}, 60_000);

afterAll(async () => {
  await container.stop();
}, 30_000);

async function createDatabase(prefix: string) {
  const databaseName = `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = postgres(container.getConnectionUri(), { max: 1 });
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  await admin.end();

  const connectionUrl = new URL(container.getConnectionUri());
  connectionUrl.pathname = `/${databaseName}`;
  return postgres(connectionUrl.href, { max: 1 });
}

async function runMigrations(client: ReturnType<typeof postgres>, migrationSet: MigrationMeta[]) {
  await client.begin(async (transaction) => {
    for (const migration of migrationSet) {
      for (const statement of migration.sql) {
        if (statement.trim()) await transaction.unsafe(statement);
      }
    }
  });
}

async function insertLegacyFixture(client: ReturnType<typeof postgres>) {
  await client.unsafe(`
    INSERT INTO "membership_type" ("id", "name", "purchasable") VALUES
      ('regular', '{"fi":"Varsinainen","en":"Regular"}'::jsonb, true),
      ('free', '{"fi":"Kunniajäsen","en":"Honorary"}'::jsonb, false);

    INSERT INTO "membership" (
      "id", "membership_type_id", "stripe_price_id", "start_time", "end_time",
      "requires_student_verification"
    ) VALUES
      ('regular-2022', 'regular', NULL, '2022-08-01T00:00:00Z', '2023-07-31T00:00:00Z', true),
      ('regular-2024', 'regular', 'price_2024', '2024-08-01T00:00:00Z', '2025-07-31T00:00:00Z', true),
      ('regular-2025', 'regular', 'price_2025', '2025-08-01T00:00:00Z', '2026-07-31T00:00:00Z', true),
      ('regular-2026', 'regular', 'price_2026', '2026-08-01T00:00:00Z', '2027-07-31T00:00:00Z', true),
      ('free-2025', 'free', NULL, '2025-08-01T00:00:00Z', '2026-07-31T00:00:00Z', false);

    INSERT INTO "user" ("id", "email") VALUES
      ('user-a', 'a@example.com'),
      ('user-b', 'b@example.com'),
      ('user-c', 'c@example.com'),
      ('user-d', 'd@example.com'),
      ('user-e', 'e@example.com'),
      ('admin', 'admin@example.com');

    UPDATE "user" SET "admin_role" = 'admin' WHERE "id" = 'admin';

    INSERT INTO "member" (
      "id", "user_id", "organization_name", "membership_id", "status", "stripe_session_id",
      "description", "created_at", "updated_at"
    ) VALUES
      ('member-a-2024', 'user-a', NULL, 'regular-2024', 'active', 'session-a-2024', 'First motive', '2024-08-02T10:00:00Z', '2024-08-03T10:00:00Z'),
      ('member-a-2025', 'user-a', NULL, 'regular-2025', 'active', 'session-a-2025', 'Latest motive', '2025-08-02T10:00:00Z', '2025-08-03T10:00:00Z'),
      ('member-b-2026', 'user-b', NULL, 'regular-2026', 'awaiting_payment', 'session-b-2026', 'New applicant', '2026-08-03T10:00:00Z', '2026-08-03T10:00:00Z'),
      ('member-c-2025', 'user-c', NULL, 'regular-2025', 'active', 'session-c-2025', 'Member C', '2025-08-03T10:00:00Z', '2025-08-03T10:00:00Z'),
      ('member-c-2026', 'user-c', NULL, 'regular-2026', 'awaiting_payment', 'session-c-2026', 'Member C renewal', '2026-08-03T10:00:00Z', '2026-08-03T10:00:00Z'),
      ('member-d-2024', 'user-d', NULL, 'regular-2024', 'active', NULL, 'Member D', '2024-08-03T10:00:00Z', '2024-08-03T10:00:00Z'),
      ('member-d-2025', 'user-d', NULL, 'regular-2025', 'resigned', NULL, 'Member D', '2025-08-03T10:00:00Z', '2026-01-15T10:00:00Z'),
      ('member-e-2022', 'user-e', NULL, 'regular-2022', 'active', NULL, 'Member E', '2022-08-03T10:00:00Z', '2022-08-03T10:00:00Z'),
      ('member-e-2024', 'user-e', NULL, 'regular-2024', 'active', NULL, 'Member E again', '2024-08-03T10:00:00Z', '2024-08-03T10:00:00Z'),
      ('member-org-2025', NULL, 'Test Association', 'free-2025', 'active', NULL, 'Association', '2025-08-03T10:00:00Z', '2025-08-03T10:00:00Z');

    INSERT INTO "audit_log" (
      "id", "user_id", "action", "target_type", "target_id", "metadata", "created_at", "updated_at"
    ) VALUES
      (
        'audit-bulk-a', 'admin', 'member.bulk_approve', 'member',
        'member-a-2024,member-a-2025',
        '{"memberIds":["member-a-2024","member-a-2025"],"count":2}'::json,
        '2025-08-04T10:00:00Z', '2025-08-04T10:00:00Z'
      ),
      (
        'audit-end-d', 'admin', 'member.deem_resigned', 'member', 'member-d-2025',
        '{"previousStatus":"active","reason":"Board decision"}'::json,
        '2026-01-15T10:00:00Z', '2026-01-15T10:00:00Z'
      );
  `);
}

describe("indefinite membership production migration", () => {
  it("rehearses an anonymized production snapshot over legacy seed data", async () => {
    const source = await createDatabase("rehearsal_source");
    const target = await createDatabase("rehearsal_target");

    try {
      await Promise.all([runMigrations(source, legacyMigrations), runMigrations(target, legacyMigrations)]);
      await insertLegacyFixture(source);

      await target.begin(async (targetTransaction) =>
        source.begin("isolation level repeatable read read only", async (sourceTransaction) =>
          copySanitizedDatabase(sourceTransaction, targetTransaction, "test-salt"),
        ),
      );

      const [user] = await target<{ email: string }[]>`
        SELECT email FROM "user" WHERE id = 'user-a'
      `;
      const [member] = await target<{ stripeSessionId: string }[]>`
        SELECT stripe_session_id AS "stripeSessionId" FROM member WHERE id = 'member-a-2024'
      `;
      const [counts] = await target<{ customizations: number; membershipTypes: number }[]>`
        SELECT
          (SELECT count(*)::integer FROM app_customization) AS customizations,
          (SELECT count(*)::integer FROM membership_type) AS "membershipTypes"
      `;

      expect(user?.email).toMatch(/^member-[a-f0-9]{16}@example\.invalid$/);
      expect(member?.stripeSessionId).toMatch(/^cs_test_rehearsal_[a-f0-9]{16}$/);
      expect(counts).toEqual({ customizations: 1, membershipTypes: 5 });

      await runMigrations(target, [membershipMigration]);
      const [result] = await target<{ members: number; payments: number }[]>`
        SELECT
          (SELECT count(*)::integer FROM member) AS members,
          (SELECT count(*)::integer FROM payment) AS payments
      `;
      expect(result).toEqual({ members: 6, payments: 9 });
    } finally {
      await Promise.all([source.end(), target.end()]);
    }
  }, 60_000);

  it("runs on a fresh installation without leaving import mode", async () => {
    const client = await createDatabase("fresh");

    try {
      await runMigrations(client, migrations);

      const [customization] = await client<{ membershipDataLiveAt: Date | null }[]>`
        SELECT "membership_data_live_at" AS "membershipDataLiveAt" FROM "app_customization"
      `;
      const [memberStatus] = await client<{ values: string[] }[]>`
        SELECT enum_range(NULL::member_status)::text[] AS "values"
      `;

      expect(customization?.membershipDataLiveAt).toBeNull();
      expect(memberStatus?.values).toEqual(["awaiting_payment", "awaiting_approval", "active", "ended", "rejected"]);
    } finally {
      await client.end();
    }
  }, 60_000);

  it("selects only each purchasable type's latest valid fee period as its application target", async () => {
    const client = await createDatabase("application_targets");

    try {
      await runMigrations(client, legacyMigrations);
      await client.unsafe(`
        INSERT INTO "membership_type" ("id", "name", "purchasable") VALUES
          ('regular', '{"fi":"Varsinainen","en":"Regular"}'::jsonb, true),
          ('external', '{"fi":"Ulkojäsen","en":"External"}'::jsonb, true),
          ('supporting', '{"fi":"Kannatusjäsen","en":"Supporting"}'::jsonb, true),
          ('free', '{"fi":"Kunniajäsen","en":"Honorary"}'::jsonb, true),
          ('internal', '{"fi":"Sisäinen","en":"Internal"}'::jsonb, false),
          ('dormant-paid', '{"fi":"Lepäävä maksullinen","en":"Dormant paid"}'::jsonb, true),
          ('dormant-internal', '{"fi":"Lepäävä sisäinen","en":"Dormant internal"}'::jsonb, false);

        INSERT INTO "membership" (
          "id", "membership_type_id", "stripe_price_id", "start_time", "end_time",
          "requires_student_verification"
        ) VALUES
          ('regular-older', 'regular', 'price_regular_old', CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE + INTERVAL '11 months', false),
          ('regular-latest', 'regular', 'price_regular_new', CURRENT_DATE + INTERVAL '1 month', CURRENT_DATE + INTERVAL '13 months', false),
          ('external-older', 'external', 'price_external_old', CURRENT_DATE - INTERVAL '2 years', CURRENT_DATE - INTERVAL '13 months', false),
          ('external-latest-expired', 'external', 'price_external_new', CURRENT_DATE - INTERVAL '1 year', CURRENT_DATE - INTERVAL '1 day', false),
          ('supporting-older-payable', 'supporting', 'price_supporting', CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE + INTERVAL '11 months', false),
          ('supporting-latest-unpriced', 'supporting', NULL, CURRENT_DATE + INTERVAL '1 month', CURRENT_DATE + INTERVAL '13 months', false),
          ('free-latest', 'free', NULL, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', false),
          ('internal-latest', 'internal', NULL, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', false);
      `);

      await runMigrations(client, [membershipMigration]);

      const types = await client<
        { id: string; purchasable: boolean; requiresPayment: boolean; applicationTargetId: string | null }[]
      >`
        SELECT
          type."id",
          type."purchasable",
          type."requires_payment" AS "requiresPayment",
          target."id" AS "applicationTargetId"
        FROM "membership_type" type
        LEFT JOIN "membership_fee_period" target
          ON target."membership_type_id" = type."id" AND target."accepts_applications"
        WHERE type."id" IN (
          'regular', 'external', 'supporting', 'free', 'internal', 'dormant-paid', 'dormant-internal'
        )
        ORDER BY type."id"
      `;
      expect(types).toEqual([
        { id: "dormant-internal", purchasable: false, requiresPayment: false, applicationTargetId: null },
        { id: "dormant-paid", purchasable: true, requiresPayment: true, applicationTargetId: null },
        { id: "external", purchasable: true, requiresPayment: true, applicationTargetId: null },
        { id: "free", purchasable: true, requiresPayment: false, applicationTargetId: "free-latest" },
        { id: "internal", purchasable: false, requiresPayment: false, applicationTargetId: null },
        { id: "regular", purchasable: true, requiresPayment: true, applicationTargetId: "regular-latest" },
        { id: "supporting", purchasable: true, requiresPayment: true, applicationTargetId: null },
      ]);
    } finally {
      await client.end();
    }
  }, 60_000);

  it("collapses legacy rows without losing payment, audit, or history evidence", async () => {
    const client = await createDatabase("legacy");

    try {
      await runMigrations(client, legacyMigrations);
      await insertLegacyFixture(client);
      await runMigrations(client, [membershipMigration]);

      const members = await client<
        {
          id: string;
          userId: string | null;
          organizationName: string | null;
          status: string;
          membershipTypeId: string | null;
          pendingMembershipTypeId: string | null;
          startedAt: Date | null;
          endedAt: Date | null;
          applicationMotive: string | null;
        }[]
      >`
        SELECT
          "id", "user_id" AS "userId", "organization_name" AS "organizationName", "status"::text,
          "membership_type_id" AS "membershipTypeId",
          "pending_membership_type_id" AS "pendingMembershipTypeId",
          "current_membership_started_at" AS "startedAt",
          "current_membership_ended_at" AS "endedAt",
          "application_motive" AS "applicationMotive"
        FROM "member"
        ORDER BY "id"
      `;

      expect(members).toHaveLength(6);
      expect(members.find((member) => member.userId === "user-a")).toMatchObject({
        id: "member-a-2025",
        status: "active",
        membershipTypeId: "regular",
        pendingMembershipTypeId: null,
        applicationMotive: "Latest motive",
      });
      expect(members.find((member) => member.userId === "user-b")).toMatchObject({
        status: "awaiting_payment",
        membershipTypeId: null,
        pendingMembershipTypeId: "regular",
      });
      expect(members.find((member) => member.userId === "user-c")).toMatchObject({
        id: "member-c-2026",
        status: "active",
        membershipTypeId: "regular",
        pendingMembershipTypeId: null,
      });
      expect(members.find((member) => member.userId === "user-d")).toMatchObject({
        id: "member-d-2025",
        status: "ended",
        membershipTypeId: "regular",
        endedAt: new Date("2026-01-15T10:00:00Z"),
      });
      expect(members.find((member) => member.organizationName === "Test Association")).toMatchObject({
        status: "active",
        membershipTypeId: "free",
      });

      const [paymentCounts] = await client<{ total: number; succeeded: number; pending: number; paidDates: number }[]>`
        SELECT
          COUNT(*)::integer AS "total",
          COUNT(*) FILTER (WHERE "status" = 'succeeded')::integer AS "succeeded",
          COUNT(*) FILTER (WHERE "status" = 'pending')::integer AS "pending",
          COUNT("paid_at")::integer AS "paidDates"
        FROM "payment"
      `;
      expect(paymentCounts).toEqual({ total: 9, succeeded: 7, pending: 2, paidDates: 0 });

      const obligations = await client<
        { memberId: string; periodId: string; kind: string; paymentStatus: string | null }[]
      >`
        SELECT
          obligation."member_id" AS "memberId",
          obligation."membership_fee_period_id" AS "periodId",
          obligation."kind"::text,
          payment."status"::text AS "paymentStatus"
        FROM "membership_obligation" obligation
        LEFT JOIN "payment" payment ON payment."obligation_id" = obligation."id"
        ORDER BY obligation."member_id"
      `;
      expect(obligations).toEqual([
        { memberId: "member-a-2025", periodId: "regular-2026", kind: "renewal", paymentStatus: null },
        {
          memberId: "member-b-2026",
          periodId: "regular-2026",
          kind: "application",
          paymentStatus: "pending",
        },
        { memberId: "member-c-2026", periodId: "regular-2026", kind: "renewal", paymentStatus: "pending" },
        { memberId: "member-e-2024", periodId: "regular-2026", kind: "renewal", paymentStatus: null },
      ]);

      const [eventCounts] = await client<{ total: number; confirmed: number; inferred: number }[]>`
        SELECT
          COUNT(*)::integer AS "total",
          COUNT(*) FILTER (WHERE "certainty" = 'confirmed')::integer AS "confirmed",
          COUNT(*) FILTER (WHERE "certainty" = 'inferred')::integer AS "inferred"
        FROM "membership_event"
      `;
      expect(eventCounts).toEqual({ total: 8, confirmed: 2, inferred: 6 });

      const [gapEvents] = await client<{ count: number }[]>`
        SELECT COUNT(*)::integer AS "count"
        FROM "membership_event"
        WHERE "member_id" = 'member-e-2024'
      `;
      expect(gapEvents?.count).toBe(3);

      const [audit] = await client<{ targetId: string; memberIds: string[] }[]>`
        SELECT
          "target_id" AS "targetId",
          ARRAY(SELECT json_array_elements_text("metadata"->'memberIds')) AS "memberIds"
        FROM "audit_log"
        WHERE "id" = 'audit-bulk-a'
      `;
      expect(audit).toEqual({ targetId: "member-a-2025", memberIds: ["member-a-2025"] });

      const [period] = await client<{ startDate: string; dueDate: string; actionDate: string }[]>`
        SELECT
          "start_date"::text AS "startDate",
          "due_date"::text AS "dueDate",
          "non_payment_action_at"::text AS "actionDate"
        FROM "membership_fee_period"
        WHERE "id" = 'regular-2025'
      `;
      expect(period).toEqual({ startDate: "2025-08-01", dueDate: "2025-09-30", actionDate: "2025-12-01" });

      const [applicationTarget] = await client<
        { id: string; publishedAt: Date | null; acceptsApplications: boolean }[]
      >`
        SELECT
          "id", "published_at" AS "publishedAt", "accepts_applications" AS "acceptsApplications"
        FROM "membership_fee_period"
        WHERE "membership_type_id" = 'regular' AND "accepts_applications"
      `;
      expect(applicationTarget).toMatchObject({
        id: "regular-2026",
        publishedAt: expect.any(Date),
        acceptsApplications: true,
      });

      const [regularType] = await client<
        { requiresPayment: boolean; requiresStudentVerification: boolean; cutoff: string | null }[]
      >`
        SELECT
          "requires_payment" AS "requiresPayment",
          "requires_student_verification" AS "requiresStudentVerification",
          "legacy_inference_through_period_id" AS "cutoff"
        FROM "membership_type"
        WHERE "id" = 'regular'
      `;
      expect(regularType).toEqual({
        requiresPayment: true,
        requiresStudentVerification: true,
        cutoff: "regular-2025",
      });

      const [customization] = await client<{ membershipDataLiveAt: Date | null }[]>`
        SELECT "membership_data_live_at" AS "membershipDataLiveAt" FROM "app_customization"
      `;
      expect(customization?.membershipDataLiveAt).toBeInstanceOf(Date);
    } finally {
      await client.end();
    }
  }, 60_000);

  it("preserves in-flight applications and type changes as actionable obligations", async () => {
    const client = await createDatabase("pending_workflows");

    try {
      await runMigrations(client, legacyMigrations);
      await client.unsafe(`
        INSERT INTO "membership_type" ("id", "name", "purchasable") VALUES
          ('regular', '{"fi":"Varsinainen","en":"Regular"}'::jsonb, true),
          ('external', '{"fi":"Ulkojäsen","en":"External"}'::jsonb, true),
          ('free', '{"fi":"Kunniajäsen","en":"Honorary"}'::jsonb, true);

        INSERT INTO "membership" (
          "id", "membership_type_id", "stripe_price_id", "start_time", "end_time",
          "requires_student_verification"
        ) VALUES
          ('regular-2025', 'regular', 'price_regular_2025', '2025-08-01T00:00:00Z', '2026-07-31T00:00:00Z', false),
          ('regular-2026', 'regular', 'price_regular_2026', '2026-08-01T00:00:00Z', '2027-07-31T00:00:00Z', false),
          ('external-2026', 'external', 'price_external_2026', '2026-08-01T00:00:00Z', '2027-07-31T00:00:00Z', false),
          ('free-2026', 'free', NULL, '2026-08-01T00:00:00Z', '2027-07-31T00:00:00Z', false);

        INSERT INTO "user" ("id", "email") VALUES
          ('type-change-user', 'type-change@example.com'),
          ('pending-change-user', 'pending-change@example.com'),
          ('free-applicant', 'free-applicant@example.com');

        INSERT INTO "member" (
          "id", "user_id", "membership_id", "status", "stripe_session_id", "created_at", "updated_at"
        ) VALUES
          ('type-change-old', 'type-change-user', 'regular-2025', 'active', 'session-type-change-old', '2025-08-02T10:00:00Z', '2025-08-02T10:00:00Z'),
          ('type-change-new', 'type-change-user', 'external-2026', 'awaiting_approval', 'session-type-change-new', '2026-08-02T10:00:00Z', '2026-08-02T11:00:00Z'),
          ('pending-change-old', 'pending-change-user', 'regular-2025', 'active', 'session-pending-change-old', '2025-08-03T10:00:00Z', '2025-08-03T10:00:00Z'),
          ('pending-change-new', 'pending-change-user', 'external-2026', 'awaiting_payment', 'session-pending-change-new', '2026-08-03T10:00:00Z', '2026-08-03T11:00:00Z'),
          ('free-application', 'free-applicant', 'free-2026', 'awaiting_approval', NULL, '2026-08-04T10:00:00Z', '2026-08-04T11:00:00Z');
      `);

      await runMigrations(client, [membershipMigration]);

      const snapshots = await client<
        { userId: string; status: string; membershipTypeId: string | null; pendingMembershipTypeId: string | null }[]
      >`
        SELECT
          "user_id" AS "userId", "status"::text,
          "membership_type_id" AS "membershipTypeId",
          "pending_membership_type_id" AS "pendingMembershipTypeId"
        FROM "member"
        WHERE "user_id" IN ('type-change-user', 'pending-change-user', 'free-applicant')
        ORDER BY "user_id"
      `;
      expect(snapshots).toEqual([
        {
          userId: "free-applicant",
          status: "awaiting_approval",
          membershipTypeId: null,
          pendingMembershipTypeId: "free",
        },
        {
          userId: "pending-change-user",
          status: "active",
          membershipTypeId: "regular",
          pendingMembershipTypeId: null,
        },
        {
          userId: "type-change-user",
          status: "active",
          membershipTypeId: "regular",
          pendingMembershipTypeId: "external",
        },
      ]);

      const obligations = await client<
        { userId: string; periodId: string; kind: string; disposition: string; paymentStatus: string | null }[]
      >`
        SELECT
          member."user_id" AS "userId",
          obligation."membership_fee_period_id" AS "periodId",
          obligation."kind"::text,
          obligation."disposition"::text,
          payment."status"::text AS "paymentStatus"
        FROM "membership_obligation" obligation
        INNER JOIN "member" member ON member."id" = obligation."member_id"
        LEFT JOIN "payment" payment ON payment."obligation_id" = obligation."id"
        ORDER BY member."user_id", obligation."membership_fee_period_id"
      `;
      expect(obligations).toEqual([
        {
          userId: "pending-change-user",
          periodId: "external-2026",
          kind: "type_change",
          disposition: "required",
          paymentStatus: "pending",
        },
        {
          userId: "pending-change-user",
          periodId: "regular-2026",
          kind: "renewal",
          disposition: "required",
          paymentStatus: null,
        },
        {
          userId: "type-change-user",
          periodId: "external-2026",
          kind: "type_change",
          disposition: "required",
          paymentStatus: "succeeded",
        },
        {
          userId: "type-change-user",
          periodId: "regular-2026",
          kind: "renewal",
          disposition: "cancelled",
          paymentStatus: null,
        },
      ]);

      const submissionEvents = await client<{ userId: string; eventType: string; periodId: string }[]>`
        SELECT
          member."user_id" AS "userId",
          event."event_type"::text AS "eventType",
          event."membership_fee_period_id" AS "periodId"
        FROM "membership_event" event
        INNER JOIN "member" member ON member."id" = event."member_id"
        WHERE event."event_type" IN ('application_submitted', 'type_change_requested')
        ORDER BY member."user_id"
      `;
      expect(submissionEvents).toEqual([
        { userId: "free-applicant", eventType: "application_submitted", periodId: "free-2026" },
        { userId: "type-change-user", eventType: "type_change_requested", periodId: "external-2026" },
      ]);
    } finally {
      await client.end();
    }
  }, 60_000);

  it("rolls back completely instead of guessing about overlapping approved types", async () => {
    const client = await createDatabase("ambiguous");

    try {
      await runMigrations(client, legacyMigrations);
      await client.unsafe(`
        INSERT INTO "membership_type" ("id", "name") VALUES
          ('regular', '{"fi":"Varsinainen","en":"Regular"}'::jsonb),
          ('external', '{"fi":"Ulkojäsen","en":"External"}'::jsonb);

        INSERT INTO "membership" (
          "id", "membership_type_id", "start_time", "end_time", "requires_student_verification"
        ) VALUES
          ('regular-2025', 'regular', '2025-08-01T00:00:00Z', '2026-07-31T00:00:00Z', false),
          ('external-2025', 'external', '2025-08-01T00:00:00Z', '2026-07-31T00:00:00Z', false);

        INSERT INTO "user" ("id", "email") VALUES ('ambiguous-user', 'ambiguous@example.com');

        INSERT INTO "member" ("id", "user_id", "membership_id", "status") VALUES
          ('ambiguous-regular', 'ambiguous-user', 'regular-2025', 'active'),
          ('ambiguous-external', 'ambiguous-user', 'external-2025', 'active');
      `);

      await expect(runMigrations(client, [membershipMigration])).rejects.toThrow(
        "overlapping approved membership types require manual classification",
      );

      const [tables] = await client<{ legacyTable: string | null; targetTable: string | null; legacyRows: number }[]>`
        SELECT
          to_regclass('public.membership')::text AS "legacyTable",
          to_regclass('public.membership_fee_period')::text AS "targetTable",
          (SELECT COUNT(*)::integer FROM "member") AS "legacyRows"
      `;
      expect(tables).toEqual({ legacyTable: "membership", targetTable: null, legacyRows: 2 });
    } finally {
      await client.end();
    }
  }, 60_000);

  it("preserves legacy reactivations as audit-only corrections", async () => {
    const client = await createDatabase("reactivation_corrections");

    try {
      await runMigrations(client, legacyMigrations);
      await client.unsafe(`
        INSERT INTO "membership_type" ("id", "name") VALUES
          ('alumni', '{"fi":"Alumni","en":"Alumni"}'::jsonb);

        INSERT INTO "membership" (
          "id", "membership_type_id", "start_time", "end_time", "requires_student_verification"
        ) VALUES
          ('alumni-2025', 'alumni', '2025-08-01T00:00:00Z', '2026-07-31T00:00:00Z', false);

        INSERT INTO "user" ("id", "email") VALUES
          ('corrected-alumni', 'corrected-alumni@example.com'),
          ('admin', 'admin@example.com');

        INSERT INTO "member" ("id", "user_id", "membership_id", "status") VALUES
          ('corrected-alumni-2025', 'corrected-alumni', 'alumni-2025', 'active');

        INSERT INTO "audit_log" (
          "id", "user_id", "action", "target_type", "target_id", "metadata"
        ) VALUES
          (
            'reactivate-one', 'admin', 'member.reactivate', 'member', 'corrected-alumni-2025',
            '{"previousStatus":"resigned","reason":"Correct imported state"}'::json
          ),
          (
            'reactivate-bulk', 'admin', 'member.bulk_reactivate', 'member', 'corrected-alumni-2025',
            '{"memberIds":["corrected-alumni-2025"],"count":1}'::json
          );
      `);

      await runMigrations(client, [membershipMigration]);

      const reactivationAudits = await client<{ id: string; targetId: string }[]>`
        SELECT "id", "target_id" AS "targetId"
        FROM "audit_log"
        WHERE "action" IN ('member.reactivate', 'member.bulk_reactivate')
        ORDER BY "id"
      `;
      expect(reactivationAudits).toEqual([
        { id: "reactivate-bulk", targetId: "corrected-alumni-2025" },
        { id: "reactivate-one", targetId: "corrected-alumni-2025" },
      ]);

      const events = await client<{ eventType: string; certainty: string }[]>`
        SELECT "event_type"::text AS "eventType", "certainty"::text
        FROM "membership_event"
        WHERE "member_id" = 'corrected-alumni-2025'
        ORDER BY "effective_at", "id"
      `;
      expect(events).toEqual([{ eventType: "legacy_membership_started_inferred", certainty: "inferred" }]);

      const [member] = await client<{ status: string; membershipTypeId: string | null }[]>`
        SELECT "status"::text, "membership_type_id" AS "membershipTypeId"
        FROM "member"
        WHERE "id" = 'corrected-alumni-2025'
      `;
      expect(member).toEqual({ status: "active", membershipTypeId: "alumni" });
    } finally {
      await client.end();
    }
  }, 60_000);
});
