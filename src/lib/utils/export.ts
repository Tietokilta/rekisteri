import Papa from "papaparse";
import { formatDate, formatDateRange } from "$lib/utils";
import type { LocalizedString } from "$lib/server/db/schema";
import type { MemberStatus, PreferredLanguage } from "$lib/shared/enums";
import type { TranslationFunctions } from "$lib/i18n/i18n-types";

export type ExportColumnKey =
  | "firstNames"
  | "lastName"
  | "email"
  | "secondaryEmails"
  | "membershipType"
  | "status"
  | "period"
  | "municipality"
  | "preferredLanguage"
  | "emailAllowed"
  | "createdAt"
  | "stripeId";

export interface ExportContext {
  locale: "fi" | "en";
  columnLabels: Record<ExportColumnKey, string>;
  statusLabels: Record<MemberStatus, string>;
  booleanLabels: { yes: string; no: string };
  languageLabels?: Record<PreferredLanguage, string>;
}

/**
 * Builds the canonical ExportContext from typesafe-i18n translation functions and current locale.
 */
export function createExportContext(LL: TranslationFunctions, locale: "fi" | "en"): ExportContext {
  return {
    locale,
    columnLabels: {
      firstNames: LL.admin.members.table.exportDialog.columns.firstNames(),
      lastName: LL.admin.members.table.exportDialog.columns.lastName(),
      email: LL.admin.members.table.exportDialog.columns.email(),
      secondaryEmails: LL.admin.members.table.exportDialog.columns.secondaryEmails(),
      membershipType: LL.admin.members.table.exportDialog.columns.membershipType(),
      status: LL.admin.members.table.exportDialog.columns.status(),
      period: LL.admin.members.table.exportDialog.columns.period(),
      municipality: LL.admin.members.table.exportDialog.columns.municipality(),
      preferredLanguage: LL.admin.members.table.exportDialog.columns.preferredLanguage(),
      emailAllowed: LL.admin.members.table.exportDialog.columns.emailAllowed(),
      createdAt: LL.admin.members.table.exportDialog.columns.createdAt(),
      stripeId: LL.admin.members.table.exportDialog.columns.stripeId(),
    },
    statusLabels: {
      active: LL.admin.members.table.active(),
      resigned: LL.admin.members.table.resigned(),
      rejected: LL.admin.members.table.rejected(),
      awaiting_approval: LL.admin.members.table.awaitingApproval(),
      awaiting_payment: LL.admin.members.table.awaitingPayment(),
    },
    languageLabels: {
      unspecified: LL.user.preferredLanguageOptions.unspecified(),
      finnish: LL.user.preferredLanguageOptions.finnish(),
      english: LL.user.preferredLanguageOptions.english(),
    },
    booleanLabels: {
      yes: LL.admin.members.table.yes(),
      no: LL.admin.members.table.no(),
    },
  };
}

export type ExportableMember = {
  id: string;
  userId: string | null;
  organizationName: string | null;
  email: string | null;
  secondaryEmails?: string[] | null;
  firstNames: string | null;
  lastName: string | null;
  homeMunicipality: string | null;
  preferredLanguage: PreferredLanguage | null;
  isAllowedEmails: boolean | null;
  membershipTypeId: string | null;
  membershipTypeName: LocalizedString | null;
  status: MemberStatus;
  membershipStartTime: Date | null;
  membershipEndTime: Date | null;
  createdAt: Date;
  stripeSessionId: string | null;
  membershipStripePriceId: string | null;
};

type ColumnFormatter = (member: ExportableMember, ctx: ExportContext) => string;

const COLUMN_FORMATTERS: Record<ExportColumnKey, ColumnFormatter> = {
  firstNames: (m) => m.firstNames ?? "",
  lastName: (m) => m.lastName ?? m.organizationName ?? "",
  email: (m) => m.email ?? "",
  secondaryEmails: (m) => m.secondaryEmails?.join(", ") ?? "",
  membershipType: (m, ctx) => m.membershipTypeName?.[ctx.locale] ?? m.membershipTypeName?.fi ?? "",
  status: (m, ctx) => ctx.statusLabels[m.status] ?? m.status,
  period: (m, ctx) =>
    m.membershipStartTime && m.membershipEndTime
      ? formatDateRange(m.membershipStartTime, m.membershipEndTime, ctx.locale)
      : m.membershipStartTime
        ? formatDate(m.membershipStartTime, ctx.locale)
        : "",
  municipality: (m) => m.homeMunicipality ?? "",
  preferredLanguage: (m, ctx) =>
    m.preferredLanguage && m.preferredLanguage !== "unspecified"
      ? (ctx.languageLabels?.[m.preferredLanguage] ?? m.preferredLanguage)
      : "",
  emailAllowed: (m, ctx) =>
    typeof m.isAllowedEmails === "boolean" ? ctx.booleanLabels[m.isAllowedEmails ? "yes" : "no"] : "",
  createdAt: (m, ctx) => (m.createdAt ? formatDate(m.createdAt, ctx.locale) : ""),
  stripeId: (m) => m.stripeSessionId ?? m.membershipStripePriceId ?? "",
};

export const ALL_EXPORT_COLUMNS: ExportColumnKey[] = Object.keys(COLUMN_FORMATTERS) as ExportColumnKey[];

export const DEFAULT_EXPORT_COLUMNS: ExportColumnKey[] = [
  "firstNames",
  "lastName",
  "email",
  "membershipType",
  "status",
  "period",
  "municipality",
];

/**
 * Strips email alias if present (e.g. name+alias@domain.com -> name@domain.com).
 */
export function stripEmailAlias(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return email;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex);

  const plusIndex = localPart.indexOf("+");
  if (plusIndex === -1) return email;

  return localPart.slice(0, plusIndex) + domain;
}

/**
 * Triggers a browser download of a given text content.
 */
export function downloadFile(content: string, filename: string, mimeType = "text/csv;charset=utf-8;"): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Generates an Excel-ready CSV string (with UTF-8 BOM) for the given members and columns.
 */
export function generateMembersCSV(
  members: ExportableMember[],
  columns: ExportColumnKey[],
  ctx: ExportContext,
): string {
  const fields = columns.map((col) => ctx.columnLabels[col]);
  const data = members.map((m) => columns.map((col) => COLUMN_FORMATTERS[col](m, ctx)));

  const csv = Papa.unparse({ fields, data }, { quotes: true, escapeFormulae: true });
  // Prepend UTF-8 BOM so Excel on Windows & macOS opens Finnish characters without corruption
  return "\u{FEFF}" + csv;
}

/**
 * Generates Google Groups CSV for member distribution lists.
 */
export function generateGoogleGroupsCSV(
  members: Array<{ email: string | null; isAllowedEmails?: boolean | null }>,
  groupEmail: "jasenet@tietokilta.fi" | "aktiivit@tietokilta.fi",
): { csv: string; count: number } {
  const eligibleMembers = (
    groupEmail === "aktiivit@tietokilta.fi" ? members.filter((m) => m.isAllowedEmails === true) : members
  ).filter((m): m is typeof m & { email: string } => Boolean(m.email));

  const data = eligibleMembers.map((m) => [groupEmail, stripEmailAlias(m.email), "User", "Member"]);
  const csv = Papa.unparse(
    { fields: ["Group Email [Required]", "Member Email", "Member Type", "Member Role"], data },
    { quotes: true, escapeFormulae: true },
  );

  return { csv, count: eligibleMembers.length };
}
