import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

      const [obligationCount] = await client<{ count: number }[]>`
        SELECT COUNT(*)::integer AS "count" FROM "membership_obligation"
      `;
      expect(obligationCount?.count).toBe(0);

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
});
