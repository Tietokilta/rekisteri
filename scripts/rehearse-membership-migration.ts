import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import path from "node:path";
import { env } from "node:process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const membershipMigrationName = "20260811200039_indefinite_membership_model";
const rehearsalSuffix = "_membership_rehearsal";
const skippedTables = new Set(["email_otp", "passkey", "session"]);

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue | undefined };
type JsonRecord = Record<string, JsonValue | undefined>;
type Queryable = postgres.Sql | postgres.TransactionSql;

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseName(url: URL) {
  return decodeURIComponent(url.pathname.slice(1));
}

export function getRehearsalDatabaseUrl(localUrlValue: string) {
  const url = new URL(localUrlValue);
  if (!new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname)) {
    throw new Error("DATABASE_URL must point to localhost; remote rehearsal targets are refused");
  }
  const name = databaseName(url);
  if (!name) throw new Error("DATABASE_URL must include a database name");
  url.pathname = `/${name.endsWith(rehearsalSuffix) ? name : `${name}${rehearsalSuffix}`}`;
  return url;
}

function isSameDatabase(left: URL, right: URL) {
  const port = (url: URL) => url.port || "5432";
  return (
    left.hostname.toLowerCase() === right.hostname.toLowerCase() &&
    port(left) === port(right) &&
    databaseName(left) === databaseName(right)
  );
}

function displayDatabase(url: URL) {
  return `${url.protocol}//${url.username ? `${url.username}@` : ""}${url.host}/${databaseName(url)}`;
}

async function promptSecret(question: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("An interactive terminal is required to enter the production database URL");
  }

  process.stdout.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = "";

  return new Promise<string>((resolve, reject) => {
    const finish = (error?: Error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value.trim());
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u{3}") return finish(new Error("Cancelled"));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u{7F}" || character === "\b") {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          value += character;
          process.stdout.write("*");
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

function pseudonym(salt: string, value: unknown) {
  return createHash("sha256")
    .update(`${salt}:${String(value)}`)
    .digest("hex")
    .slice(0, 16);
}

function sanitizeAuditMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as JsonRecord;
  return {
    ...(typeof metadata.previousStatus === "string" && { previousStatus: metadata.previousStatus }),
    ...(Array.isArray(metadata.memberIds) &&
      metadata.memberIds.every((id) => typeof id === "string") && { memberIds: metadata.memberIds }),
    ...(typeof metadata.count === "number" && { count: metadata.count }),
    ...(metadata.reason !== undefined && { reason: "[redacted]" }),
  };
}

export function sanitizeRow(table: string, source: JsonRecord, salt: string): JsonRecord {
  const row = { ...source };
  const identity = row.id ?? JSON.stringify(row);
  const token = pseudonym(salt, identity);

  if (typeof row.email === "string") row.email = `member-${token}@example.invalid`;
  if ("first_names" in row) row.first_names = row.first_names === null ? null : "Test";
  if ("last_name" in row) row.last_name = row.last_name === null ? null : `Member ${token.slice(0, 6)}`;
  if ("home_municipality" in row) row.home_municipality = row.home_municipality === null ? null : "Test municipality";
  if ("organization_name" in row) {
    row.organization_name =
      row.organization_name === null
        ? null
        : `Test organization ${pseudonym(salt, `organization:${row.organization_name}`)}`;
  }
  if (table === "member" && "description" in row) row.description = row.description === null ? null : "[redacted]";
  if ("application_motive" in row) row.application_motive = row.application_motive === null ? null : "[redacted]";
  if ("ip_address" in row) row.ip_address = null;
  if ("user_agent" in row) row.user_agent = null;
  if ("stripe_customer_id" in row) row.stripe_customer_id = null;
  if ("stripe_session_id" in row) {
    row.stripe_session_id = row.stripe_session_id === null ? null : `cs_test_rehearsal_${token}`;
  }
  if ("qr_token" in row) row.qr_token = null;
  if ("device_name" in row) row.device_name = row.device_name === null ? null : "Test device";
  if (table === "audit_log" && "metadata" in row) row.metadata = sanitizeAuditMetadata(row.metadata);

  if (table === "secondary_email") {
    row.email = `secondary-${token}@example.invalid`;
    row.domain = "example.invalid";
  }
  if (table === "app_customization") {
    row.organization_name = { fi: "Testiyhdistys", en: "Test association" };
    row.organization_legal_name = { fi: "Testiyhdistys ry", en: "Test association" };
    row.app_name = { fi: "Testirekisteri", en: "Test registry" };
    row.business_id = "0000000-0";
    row.overseer_contact = "test@example.invalid";
    row.overseer_address = "[redacted]";
    row.privacy_policy = { fi: "[redacted]", en: "[redacted]" };
    row.logo = null;
    row.logo_dark = null;
    row.favicon = null;
    row.favicon_dark = null;
  }

  return row;
}

async function runMigrations(client: Queryable, migrations: MigrationMeta[]) {
  for (const migration of migrations) {
    for (const statement of migration.sql) {
      if (statement.trim()) await client.unsafe(statement);
    }
  }
}

async function listTables(client: Queryable) {
  const rows = await client<{ tableName: string }[]>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return rows.map((row) => row.tableName);
}

async function listColumns(client: Queryable, table: string) {
  const rows = await client<{ columnName: string }[]>`
    SELECT column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  return rows.map((row) => row.columnName);
}

async function insertionOrder(client: Queryable, tables: string[]) {
  const dependencies = new Map(tables.map((table) => [table, new Set<string>()]));
  const rows = await client<{ tableName: string; referencedTable: string }[]>`
    SELECT tc.table_name AS "tableName", ccu.table_name AS "referencedTable"
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema = tc.constraint_schema AND ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
  `;
  for (const row of rows) {
    if (row.tableName !== row.referencedTable && dependencies.has(row.referencedTable)) {
      dependencies.get(row.tableName)?.add(row.referencedTable);
    }
  }

  const ordered: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = [...remaining].filter((table) =>
      [...(dependencies.get(table) ?? [])].every((item) => !remaining.has(item)),
    );
    if (ready.length === 0) throw new Error(`Cannot resolve table insertion order: ${[...remaining].join(", ")}`);
    ready.sort((left, right) => left.localeCompare(right));
    for (const table of ready) {
      ordered.push(table);
      remaining.delete(table);
    }
  }
  return ordered;
}

export async function copySanitizedDatabase(
  source: postgres.TransactionSql,
  target: postgres.TransactionSql,
  salt: string,
) {
  const targetTables = await listTables(target);
  const sourceTables = new Set(await listTables(source));
  const missing = targetTables.filter((table) => !sourceTables.has(table));
  if (missing.length > 0) throw new Error(`Production is missing expected legacy tables: ${missing.join(", ")}`);

  const unexpected = [...sourceTables].filter((table) => !targetTables.includes(table));
  if (unexpected.length > 0) throw new Error(`Production has unexpected legacy tables: ${unexpected.join(", ")}`);

  const orderedTables = await insertionOrder(target, targetTables);
  await target.unsafe(`TRUNCATE TABLE ${targetTables.map(quoteIdentifier).join(", ")} RESTART IDENTITY`);
  const counts: Record<string, number> = {};
  for (const table of orderedTables) {
    const [sourceColumns, targetColumns] = await Promise.all([listColumns(source, table), listColumns(target, table)]);
    if (sourceColumns.join("\0") !== targetColumns.join("\0")) {
      throw new Error(`Schema mismatch for ${table}; production and the expected legacy schema differ`);
    }

    const sourceCount = await source.unsafe<{ count: number }[]>(
      `SELECT count(*)::integer AS count FROM ${quoteIdentifier(table)}`,
    );
    const expectedCount = sourceCount[0]?.count;
    if (expectedCount === undefined) throw new Error(`Could not count source rows in ${table}`);
    if (skippedTables.has(table)) {
      counts[table] = 0;
      console.log(`  ${table}: omitted ${expectedCount} authentication rows`);
      continue;
    }

    let offset = 0;
    let copied = 0;
    while (true) {
      const rows = await source.unsafe<{ data: JsonRecord }[]>(
        `SELECT to_jsonb(source_row) AS data FROM ${quoteIdentifier(table)} source_row ORDER BY ctid LIMIT 500 OFFSET ${offset}`,
      );
      if (rows.length === 0) break;
      const sanitized = rows.map((row) => sanitizeRow(table, row.data, salt));
      await target.unsafe(
        `INSERT INTO ${quoteIdentifier(table)} SELECT * FROM json_populate_recordset(NULL::${quoteIdentifier(table)}, $1::json)`,
        [target.json(sanitized)],
      );
      copied += rows.length;
      offset += rows.length;
    }
    const targetCount = await target.unsafe<{ count: number }[]>(
      `SELECT count(*)::integer AS count FROM ${quoteIdentifier(table)}`,
    );
    const actualCount = targetCount[0]?.count;
    if (actualCount === undefined) throw new Error(`Could not count target rows in ${table}`);
    if (copied !== expectedCount || actualCount !== expectedCount) {
      throw new Error(`${table}: expected ${expectedCount} rows, read ${copied}, inserted ${actualCount}`);
    }
    counts[table] = copied;
    console.log(`  ${table}: ${copied}`);
  }
  return counts;
}

async function scalar(client: Queryable, query: string) {
  const [row] = await client.unsafe<{ value: number }[]>(query);
  return Number(row?.value ?? 0);
}

async function assertNoAmbiguousLegacyMemberships(client: Queryable) {
  const overlaps = await client<
    {
      identity: string;
      leftMemberId: string;
      leftStatus: string;
      leftPeriodId: string;
      leftTypeId: string;
      leftStart: Date;
      leftEnd: Date;
      rightMemberId: string;
      rightStatus: string;
      rightPeriodId: string;
      rightTypeId: string;
      rightStart: Date;
      rightEnd: Date;
    }[]
  >`
    SELECT
      COALESCE(identity.email, left_member.organization_name) AS identity,
      left_member.id AS "leftMemberId",
      left_member.status::text AS "leftStatus",
      left_period.id AS "leftPeriodId",
      left_period.membership_type_id AS "leftTypeId",
      left_period.start_time AS "leftStart",
      left_period.end_time AS "leftEnd",
      right_member.id AS "rightMemberId",
      right_member.status::text AS "rightStatus",
      right_period.id AS "rightPeriodId",
      right_period.membership_type_id AS "rightTypeId",
      right_period.start_time AS "rightStart",
      right_period.end_time AS "rightEnd"
    FROM member left_member
    INNER JOIN membership left_period ON left_period.id = left_member.membership_id
    INNER JOIN member right_member
      ON COALESCE('user:' || left_member.user_id, 'organization:' || left_member.organization_name)
        = COALESCE('user:' || right_member.user_id, 'organization:' || right_member.organization_name)
      AND left_member.id < right_member.id
    INNER JOIN membership right_period ON right_period.id = right_member.membership_id
    LEFT JOIN "user" identity ON identity.id = left_member.user_id
    WHERE left_period.membership_type_id <> right_period.membership_type_id
      AND left_member.status IN ('active', 'resigned')
      AND right_member.status IN ('active', 'resigned')
      AND left_period.start_time <= right_period.end_time
      AND right_period.start_time <= left_period.end_time
    ORDER BY identity, "leftStart", "rightStart", "leftMemberId", "rightMemberId"
  `;

  if (overlaps.length === 0) return;
  console.error("\nAmbiguous overlapping approved membership rows:\n");
  console.error(JSON.stringify(overlaps, null, 2));
  throw new Error(`Found ${overlaps.length} overlapping membership pair(s) requiring classification`);
}

async function migrationReport(client: Queryable, copiedRows: Record<string, number>) {
  const eventSources = await client<{ source: string; certainty: string; count: number }[]>`
    SELECT source, certainty, count(*)::integer AS count
    FROM membership_event GROUP BY source, certainty ORDER BY source, certainty
  `;
  const paymentSources = await client<{ source: string; status: string; count: number }[]>`
    SELECT source, status, count(*)::integer AS count
    FROM payment GROUP BY source, status ORDER BY source, status
  `;
  const unavailableTypes = await client<{ id: string }[]>`
    SELECT type.id
    FROM membership_type type
    WHERE type.purchasable AND NOT EXISTS (
      SELECT 1 FROM membership_fee_period period
      WHERE period.membership_type_id = type.id AND period.accepts_applications
    )
    ORDER BY type.id
  `;

  return {
    copiedRows,
    result: {
      stableMembers: await scalar(client, `SELECT count(*)::integer AS value FROM member`),
      feePeriods: await scalar(client, `SELECT count(*)::integer AS value FROM membership_fee_period`),
      obligations: await scalar(client, `SELECT count(*)::integer AS value FROM membership_obligation`),
      payments: await scalar(client, `SELECT count(*)::integer AS value FROM payment`),
      membershipEvents: await scalar(client, `SELECT count(*)::integer AS value FROM membership_event`),
      applicationTargets: await scalar(
        client,
        `SELECT count(*)::integer AS value FROM membership_fee_period WHERE accepts_applications`,
      ),
      legacyReactivationCorrections: await scalar(
        client,
        `SELECT count(*)::integer AS value FROM audit_log WHERE action IN ('member.reactivate', 'member.bulk_reactivate')`,
      ),
    },
    eventSources,
    paymentSources,
    unavailablePurchasableTypes: unavailableTypes.map((row) => row.id),
    invariants: {
      membersWithoutIdentity: await scalar(
        client,
        `SELECT count(*)::integer AS value FROM member WHERE (user_id IS NULL) = (organization_name IS NULL)`,
      ),
      orphanEvents: await scalar(
        client,
        `SELECT count(*)::integer AS value FROM membership_event event LEFT JOIN member ON member.id = event.member_id WHERE member.id IS NULL`,
      ),
      orphanPayments: await scalar(
        client,
        `SELECT count(*)::integer AS value FROM payment LEFT JOIN member ON member.id = payment.member_id WHERE member.id IS NULL`,
      ),
      typesWithMultipleTargets: await scalar(
        client,
        `SELECT count(*)::integer AS value FROM (SELECT membership_type_id FROM membership_fee_period WHERE accepts_applications GROUP BY membership_type_id HAVING count(*) > 1) invalid`,
      ),
    },
  };
}

async function recreateDatabase(targetUrl: URL) {
  const targetName = databaseName(targetUrl);
  if (!targetName.endsWith(rehearsalSuffix))
    throw new Error("Refusing to recreate a database without the rehearsal suffix");
  const adminUrl = new URL(targetUrl);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.href, { max: 1 });
  try {
    await admin`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${targetName} AND pid <> pg_backend_pid()
    `;
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(targetName)}`);
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(targetName)}`);
  } finally {
    await admin.end();
  }
}

async function dropDatabase(targetUrl: URL) {
  const targetName = databaseName(targetUrl);
  if (!targetName.endsWith(rehearsalSuffix))
    throw new Error("Refusing to drop a database without the rehearsal suffix");
  const adminUrl = new URL(targetUrl);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.href, { max: 1 });
  try {
    await admin`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${targetName} AND pid <> pg_backend_pid()
    `;
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(targetName)}`);
  } finally {
    await admin.end();
  }
}

async function main() {
  const localUrlValue = env.DATABASE_URL;
  if (!localUrlValue) throw new Error("DATABASE_URL is required for deriving the local rehearsal database");
  const targetUrl = getRehearsalDatabaseUrl(localUrlValue);
  const sourceValue = await promptSecret("Production database URL (hidden): ");
  if (!sourceValue) throw new Error("Production database URL is required");
  const sourceUrl = new URL(sourceValue);
  if (isSameDatabase(sourceUrl, targetUrl)) throw new Error("Source and target databases must differ");

  console.log(`Local rehearsal target: ${displayDatabase(targetUrl)}`);
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const confirmation = await readline.question(`Recreate ${databaseName(targetUrl)}? [y/N] `);
  readline.close();
  if (confirmation.trim().toLowerCase() !== "y") throw new Error("Cancelled");

  const migrations = readMigrationFiles({ migrationsFolder: path.join(process.cwd(), "drizzle") });
  const membershipIndex = migrations.findIndex((migration) => migration.name === membershipMigrationName);
  if (membershipIndex === -1) throw new Error(`Migration ${membershipMigrationName} was not found`);

  await recreateDatabase(targetUrl);
  const source = postgres(sourceUrl.href, { max: 1, idle_timeout: 20 });
  const target = postgres(targetUrl.href, { max: 1 });
  let succeeded = false;
  try {
    const report = await target.begin(async (localTransaction) => {
      console.log("Building local legacy schema...");
      await runMigrations(localTransaction, migrations.slice(0, membershipIndex));

      const copiedRows = await source.begin("isolation level repeatable read read only", async (readOnlySource) => {
        const [sourceTransaction] = await readOnlySource<{ readOnly: string; isolation: string }[]>`
            SELECT
              current_setting('transaction_read_only') AS "readOnly",
              current_setting('transaction_isolation') AS isolation
          `;
        if (sourceTransaction?.readOnly !== "on" || sourceTransaction.isolation !== "repeatable read") {
          throw new Error("Production transaction is not REPEATABLE READ and READ ONLY");
        }

        const [legacyTable] = await readOnlySource<{ exists: boolean }[]>`
            SELECT to_regclass('public.membership') IS NOT NULL AS exists
          `;
        if (!legacyTable?.exists) throw new Error("Source is not a legacy membership database");

        console.log("Copying and anonymizing production rows...");
        return copySanitizedDatabase(readOnlySource, localTransaction, randomUUID());
      });

      await assertNoAmbiguousLegacyMemberships(localTransaction);
      console.log("Running current migrations...");
      await runMigrations(localTransaction, migrations.slice(membershipIndex));

      const migrationResult = await migrationReport(localTransaction, copiedRows);
      const failedInvariants = Object.entries(migrationResult.invariants).filter(([, count]) => count !== 0);
      if (failedInvariants.length > 0) {
        throw new Error(`Invariant failures: ${failedInvariants.map(([key]) => key).join(", ")}`);
      }
      return migrationResult;
    });

    console.log("\nMigration rehearsal report:\n");
    console.log(JSON.stringify(report, null, 2));
    succeeded = true;
    console.log(`\nRehearsal succeeded. Point DATABASE_URL at local ${databaseName(targetUrl)} to inspect it.`);
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
    if (!succeeded) {
      try {
        await dropDatabase(targetUrl);
        console.error(`Removed failed rehearsal database ${databaseName(targetUrl)}.`);
      } catch (error) {
        console.error(`Could not remove failed rehearsal database ${databaseName(targetUrl)}:`, error);
      }
    }
  }
}

function selfTest() {
  assert.equal(
    databaseName(getRehearsalDatabaseUrl("postgres://user:pass@localhost:5432/registry_dev")),
    "registry_dev_membership_rehearsal",
  );
  assert.throws(() => getRehearsalDatabaseUrl("postgres://user:pass@example.com/registry"), /localhost/);
  assert.equal(
    isSameDatabase(
      new URL("postgres://source:secret@localhost/registry"),
      new URL("postgres://target:other@localhost:5432/registry"),
    ),
    true,
  );
  const row = sanitizeRow(
    "user",
    { id: "user-1", email: "person@example.com", first_names: "Real", stripe_customer_id: "cus_secret" },
    "salt",
  );
  assert.match(String(row.email), /^member-[a-f0-9]{16}@example\.invalid$/);
  assert.equal(row.first_names, "Test");
  assert.equal(row.stripe_customer_id, null);

  const member = sanitizeRow(
    "member",
    { id: "member-1", stripe_session_id: "cs_live_secret", description: "Personal motive" },
    "salt",
  );
  assert.match(String(member.stripe_session_id), /^cs_test_rehearsal_[a-f0-9]{16}$/);
  assert.equal(member.description, "[redacted]");

  const audit = sanitizeRow(
    "audit_log",
    {
      id: "audit-1",
      metadata: { previousStatus: "active", memberIds: ["member-1"], performedBy: "Real Name" },
    },
    "salt",
  );
  assert.deepEqual(audit.metadata, { previousStatus: "active", memberIds: ["member-1"] });

  const membershipType = sanitizeRow("membership_type", { id: "regular", description: { fi: "Kuvaus" } }, "salt");
  assert.deepEqual(membershipType.description, { fi: "Kuvaus" });
}

if (process.argv.includes("--self-test")) selfTest();
else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
