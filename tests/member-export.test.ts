import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  stripEmailAlias,
  generateGoogleGroupsCSV,
  generateMembersCSV,
  DEFAULT_EXPORT_COLUMNS,
  type ExportableMember,
  type ExportColumnKey,
} from "$lib/utils/export";
import type { MemberStatus, PreferredLanguage } from "$lib/shared/enums";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "$lib/server/db/schema";
import { eq, sql } from "drizzle-orm";

describe("stripEmailAlias", () => {
  it("removes plus aliases from email addresses", () => {
    expect(stripEmailAlias("teemu+test@tietokilta.fi")).toBe("teemu@tietokilta.fi");
    expect(stripEmailAlias("user+something+else@domain.org")).toBe("user@domain.org");
  });

  it("leaves standard email addresses unchanged", () => {
    expect(stripEmailAlias("teemu@tietokilta.fi")).toBe("teemu@tietokilta.fi");
  });

  it("handles strings without an @ symbol", () => {
    expect(stripEmailAlias("invalid-email")).toBe("invalid-email");
  });
});

describe("generateGoogleGroupsCSV", () => {
  const sampleMembers = [
    { email: "allowed+test@tietokilta.fi", isAllowedEmails: true },
    { email: "notallowed@tietokilta.fi", isAllowedEmails: false },
    { email: null, isAllowedEmails: true },
  ];

  it("exports all members with valid emails for jasenet@", () => {
    const csv = generateGoogleGroupsCSV(sampleMembers, "jasenet@tietokilta.fi");
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Group Email [Required],Member Email,Member Type,Member Role");
    expect(lines).toHaveLength(3); // header + 2 members with emails
    expect(lines[1]).toBe('"jasenet@tietokilta.fi","allowed@tietokilta.fi","User","Member"');
    expect(lines[2]).toBe('"jasenet@tietokilta.fi","notallowed@tietokilta.fi","User","Member"');
  });

  it("exports only members who opted in for aktiivit@", () => {
    const csv = generateGoogleGroupsCSV(sampleMembers, "aktiivit@tietokilta.fi");
    const lines = csv.split("\n");

    expect(lines).toHaveLength(2); // header + 1 allowed member
    expect(lines[1]).toBe('"aktiivit@tietokilta.fi","allowed@tietokilta.fi","User","Member"');
  });
});

describe("generateMembersCSV", () => {
  const sampleMembers: ExportableMember[] = [
    {
      id: "member-1",
      userId: "user-1",
      organizationName: null,
      email: "teemu@tietokilta.fi",
      secondaryEmails: ["teemu@aalto.fi", "teemu@alumni.aalto.fi"],
      firstNames: "Teemu",
      lastName: "Teekkari",
      homeMunicipality: "Espoo",
      preferredLanguage: "finnish",
      isAllowedEmails: true,
      membershipTypeId: "type-1",
      membershipTypeName: { fi: "Varsinainen jäsen", en: "Regular member" },
      status: "active",
      membershipStartTime: new Date("2024-08-01T00:00:00Z"),
      membershipEndTime: new Date("2025-07-31T23:59:59Z"),
      createdAt: new Date("2024-08-01T12:00:00Z"),
      stripeSessionId: "cs_123",
      membershipStripePriceId: "price_123",
    },
    {
      id: "member-2",
      userId: null,
      organizationName: "Otaniemen killat ry",
      email: null,
      secondaryEmails: [],
      firstNames: null,
      lastName: null,
      homeMunicipality: null,
      preferredLanguage: null,
      isAllowedEmails: null,
      membershipTypeId: "type-2",
      membershipTypeName: { fi: "Yhdistysjäsen", en: "Association member" },
      status: "awaiting_approval",
      membershipStartTime: new Date("2024-08-01T00:00:00Z"),
      membershipEndTime: new Date("2025-07-31T23:59:59Z"),
      createdAt: new Date("2024-08-02T12:00:00Z"),
      stripeSessionId: null,
      membershipStripePriceId: null,
    },
  ];

  const columnLabels: Record<ExportColumnKey, string> = {
    firstNames: "Etunimet",
    lastName: "Sukunimi / Yhdistys",
    email: "Sähköposti",
    secondaryEmails: "Toissijaiset sähköpostit",
    membershipType: "Jäsentyyppi",
    status: "Tila",
    period: "Jäsenyyskausi",
    municipality: "Kotikunta",
    preferredLanguage: "Asiointikieli",
    emailAllowed: "Sähköpostilupa",
    createdAt: "Luotu",
    stripeId: "Stripe-tunniste",
  };

  const statusLabels: Record<MemberStatus, string> = {
    active: "Aktiivinen",
    awaiting_approval: "Odottaa hyväksyntää",
    awaiting_payment: "Odottaa maksua",
    resigned: "Eronnut",
    rejected: "Hylätty",
  };

  const booleanLabels = {
    yes: "Kyllä",
    no: "Ei",
  };

  it("prepends the UTF-8 BOM to ensure Excel compatibility", () => {
    const csv = generateMembersCSV(sampleMembers, DEFAULT_EXPORT_COLUMNS, {
      locale: "fi",
      columnLabels,
      statusLabels,
      booleanLabels,
    });
    expect(csv.startsWith("\u{FEFF}")).toBe(true);
  });

  it("generates correct headers and rows for person and association members", () => {
    const csv = generateMembersCSV(sampleMembers, DEFAULT_EXPORT_COLUMNS, {
      locale: "fi",
      columnLabels,
      statusLabels,
      booleanLabels,
    });
    const contentWithoutBOM = csv.slice(1);
    const lines = contentWithoutBOM.trim().split("\r\n");

    // Header check
    expect(lines[0]).toBe(
      '"Etunimet","Sukunimi / Yhdistys","Sähköposti","Jäsentyyppi","Tila","Jäsenyyskausi","Kotikunta"',
    );

    // Person member check
    expect(lines[1]).toContain('"Teemu"');
    expect(lines[1]).toContain('"Teekkari"');
    expect(lines[1]).toContain('"teemu@tietokilta.fi"');
    expect(lines[1]).toContain('"Varsinainen jäsen"');
    expect(lines[1]).toContain('"Aktiivinen"');
    expect(lines[1]).toContain('"Espoo"');

    // Association member check (organizationName in last name column, empty first name)
    expect(lines[2]).toContain('""');
    expect(lines[2]).toContain('"Otaniemen killat ry"');
    expect(lines[2]).toContain('"Yhdistysjäsen"');
    expect(lines[2]).toContain('"Odottaa hyväksyntää"');
  });

  it("respects English locale localization", () => {
    const enColumnLabels: Record<ExportColumnKey, string> = {
      ...columnLabels,
      membershipType: "Membership Type",
      status: "Status",
    };
    const enStatusLabels: Record<MemberStatus, string> = {
      active: "Active",
      awaiting_approval: "Awaiting Approval",
      awaiting_payment: "Awaiting Payment",
      resigned: "Resigned",
      rejected: "Rejected",
    };

    const csv = generateMembersCSV(sampleMembers, ["membershipType", "status"], {
      locale: "en",
      columnLabels: enColumnLabels,
      statusLabels: enStatusLabels,
      booleanLabels: { yes: "Yes", no: "No" },
    });
    const lines = csv.slice(1).trim().split("\r\n");

    expect(lines[0]).toBe('"Membership Type","Status"');
    expect(lines[1]).toBe('"Regular member","Active"');
    expect(lines[2]).toBe('"Association member","Awaiting Approval"');
  });

  it("exports secondary emails when included in columns", () => {
    const csv = generateMembersCSV(sampleMembers, ["email", "secondaryEmails"], {
      locale: "fi",
      columnLabels,
      statusLabels,
      booleanLabels,
    });
    const lines = csv.slice(1).trim().split("\r\n");

    expect(lines[0]).toBe('"Sähköposti","Toissijaiset sähköpostit"');
    expect(lines[1]).toBe('"teemu@tietokilta.fi","teemu@aalto.fi, teemu@alumni.aalto.fi"');
    expect(lines[2]).toBe('"",""');
  });

  it("exports preferred language using language labels", () => {
    const languageLabels: Record<PreferredLanguage, string> = {
      unspecified: "Määrittelemätön",
      finnish: "Suomi",
      english: "Englanti",
    };
    const csv = generateMembersCSV(sampleMembers, ["preferredLanguage"], {
      locale: "fi",
      columnLabels,
      statusLabels,
      booleanLabels,
      languageLabels,
    });
    const lines = csv.slice(1).trim().split("\r\n");

    expect(lines[0]).toBe('"Asiointikieli"');
    expect(lines[1]).toBe('"Suomi"');
    expect(lines[2]).toBe('""');
  });

  it("exports emailAllowed using boolean labels", () => {
    const csv = generateMembersCSV(sampleMembers, ["emailAllowed"], {
      locale: "fi",
      columnLabels,
      statusLabels,
      booleanLabels,
    });
    const lines = csv.slice(1).trim().split("\r\n");

    expect(lines[0]).toBe('"Sähköpostilupa"');
    expect(lines[1]).toBe('"Kyllä"');
    expect(lines[2]).toBe('""');
  });
});

describe("loadMembers secondaryEmails subquery execution", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await stopTestDatabase(testDb);
  });

  it("fetches member rows with secondaryEmails aggregated directly from Postgres", async () => {
    // 1. Create a user with secondary emails
    await testDb.db.insert(table.user).values({
      id: "user-with-secondary",
      email: "primary@example.com",
      firstNames: "Teemu",
      lastName: "Teekkari",
    });

    await testDb.db.insert(table.secondaryEmail).values([
      {
        id: "se-1",
        userId: "user-with-secondary",
        email: "sec1@example.com",
        domain: "example.com",
        verifiedAt: new Date(),
      },
      {
        id: "se-2",
        userId: "user-with-secondary",
        email: "sec2@example.com",
        domain: "example.com",
        verifiedAt: new Date(),
      },
      {
        id: "se-unverified",
        userId: "user-with-secondary",
        email: "unverified@example.com",
        domain: "example.com",
        verifiedAt: null, // Unverified - should be excluded
      },
    ]);

    // 2. Create a user without secondary emails
    await testDb.db.insert(table.user).values({
      id: "user-without-secondary",
      email: "single@example.com",
      firstNames: "Matti",
      lastName: "Meikäläinen",
    });

    // 3. Create membership type and membership
    await testDb.db.insert(table.membershipType).values({
      id: "test-type-subq",
      name: { fi: "Jäsen", en: "Member" },
      purchasable: true,
    });

    await testDb.db.insert(table.membership).values({
      id: "test-membership-subq",
      membershipTypeId: "test-type-subq",
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-12-31"),
    });

    // 4. Create member rows (including an association member without userId)
    await testDb.db.insert(table.member).values([
      {
        id: "member-with-sec",
        userId: "user-with-secondary",
        membershipId: "test-membership-subq",
        status: "active",
      },
      {
        id: "member-no-sec",
        userId: "user-without-secondary",
        membershipId: "test-membership-subq",
        status: "active",
      },
      {
        id: "member-assoc",
        userId: null,
        organizationName: "Testiyhdistys ry",
        membershipId: "test-membership-subq",
        status: "active",
      },
    ]);

    // Execute the exact subquery pattern from +page.server.ts
    const subQuery = testDb.db
      .select({
        id: table.member.id,
        userId: table.member.userId,
        organizationName: table.member.organizationName,
        secondaryEmails: sql<string[]>`COALESCE(
          (
            SELECT array_agg(${table.secondaryEmail.email})
            FROM ${table.secondaryEmail}
            WHERE ${table.secondaryEmail.userId} = ${table.user.id}
              AND ${table.secondaryEmail.verifiedAt} IS NOT NULL
          ),
          ARRAY[]::text[]
        )`.as("secondaryEmails"),
      })
      .from(table.member)
      .leftJoin(table.user, eq(table.member.userId, table.user.id))
      .as("subQuery");

    const rows = await testDb.db.select().from(subQuery);

    expect(rows).toHaveLength(3);

    const withSec = rows.find((r) => r.id === "member-with-sec");
    expect(withSec?.secondaryEmails).toEqual(["sec1@example.com", "sec2@example.com"]);

    const noSec = rows.find((r) => r.id === "member-no-sec");
    expect(noSec?.secondaryEmails).toEqual([]);

    const assoc = rows.find((r) => r.id === "member-assoc");
    expect(assoc?.secondaryEmails).toEqual([]);
  });
});
