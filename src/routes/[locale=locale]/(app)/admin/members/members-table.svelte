<!-- fallow-ignore-file complexity -->
<script lang="ts">
  import {
    FlexRender,
    columnFilteringFeature,
    columnVisibilityFeature,
    createFilteredRowModel,
    createPaginatedRowModel,
    createSortedRowModel,
    createTable,
    filterFn_equals,
    globalFilteringFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    sortFn_alphanumeric,
    sortFn_datetime,
    sortFn_text,
    tableFeatures,
    type ColumnDef,
    type ColumnFiltersState,
    type Row as TanStackRow,
    type RowSelectionState,
    type SortingState,
  } from "@tanstack/svelte-table";
  import * as Table from "$lib/components/ui/table";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as NativeSelect from "$lib/components/ui/native-select";
  import { toast } from "svelte-sonner";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import Download from "@lucide/svelte/icons/download";
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { SvelteURLSearchParams } from "svelte/reactivity";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { isNonEmpty, formatDate } from "$lib/utils";
  import { getStripePriceMetadata } from "$lib/api/stripe.remote";
  import {
    approveMember,
    rejectMember,
    markMemberResigned,
    resignMember,
    reactivateMember,
    bulkApproveMembers,
    bulkMarkMembersResigned,
    changeMemberType,
  } from "./data.remote";

  import type { LocalizedString, MembershipType } from "$lib/server/db/schema";

  type FeeHistoryItem = {
    id: string;
    membershipTypeId: string;
    startTime: Date;
    endTime: Date;
    stripePriceId: string | null;
    obligation: {
      kind: "renewal" | "application" | "type_change";
      disposition: "required" | "waived" | "cancelled";
      dispositionReason: string | null;
    } | null;
    payments: Array<{
      id: string;
      status: "pending" | "succeeded" | "failed" | "expired";
      source: "stripe" | "manual" | "imported";
      amount: number | null;
      currency: string | null;
      paidAt: Date | null;
      createdAt: Date;
      stripeSessionId: string | null;
      refundRequiredAt: Date | null;
      refundConfirmedAt: Date | null;
      invalidatedAt: Date | null;
    }>;
  };

  type MembershipEventItem = {
    id: string;
    eventType:
      | "application_submitted"
      | "application_approved"
      | "application_rejected"
      | "type_change_requested"
      | "type_changed"
      | "type_change_rejected"
      | "resigned_voluntarily"
      | "deemed_resigned_nonpayment"
      | "expelled"
      | "legacy_membership_started_inferred"
      | "legacy_resignation_inferred"
      | "legacy_rejoin_inferred"
      | "legacy_type_changed_inferred"
      | "membership_decision_corrected";
    effectiveAt: Date;
    recordedAt: Date;
    source: "admin" | "system" | "imported" | "migration";
    certainty: "confirmed" | "inferred";
    actorName: string | null;
    membershipFeePeriodId: string | null;
    feePeriodStartTime: Date | null;
    feePeriodEndTime: Date | null;
    data: {
      reason?: string;
      membershipTypeId?: string;
      fromMembershipTypeId?: string;
      toMembershipTypeId?: string;
    };
  };

  type BaseMemberRow = {
    id: string;
    status: "awaiting_payment" | "awaiting_approval" | "active" | "ended" | "rejected";
    applicationMotive: string | null;
    createdAt: Date;
    updatedAt: Date;
    membershipTypeId: string | null;
    membershipTypeName: LocalizedString | null;
    currentMembershipStartedAt: Date | null;
    currentMembershipEndedAt: Date | null;
    correctionFeePeriodId: string | null;
    feePeriodYears: string[];
    feeHistory: FeeHistoryItem[];
    membershipEvents: MembershipEventItem[];
    canBeDeemedResigned: boolean;
  };

  type PersonMemberRow = BaseMemberRow & {
    userId: string;
    organizationName: null;
    email: string | null;
    firstNames: string | null;
    lastName: string | null;
    homeMunicipality: string | null;
    preferredLanguage: "unspecified" | "finnish" | "english" | null;
    isAllowedEmails: boolean | null;
  };

  type AssociationMemberRow = BaseMemberRow & {
    userId: null;
    organizationName: string;
    email: null;
    firstNames: null;
    lastName: null;
    homeMunicipality: null;
    preferredLanguage: null;
    isAllowedEmails: null;
  };

  type MemberRow = PersonMemberRow | AssociationMemberRow;

  const features = tableFeatures({
    columnFilteringFeature,
    globalFilteringFeature,
    columnVisibilityFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    filteredRowModel: createFilteredRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
    sortedRowModel: createSortedRowModel(),
    sortFns: {
      alphanumeric: sortFn_alphanumeric,
      datetime: sortFn_datetime,
      text: sortFn_text,
    },
  });

  // Raw type from the server — userId and organizationName are both `| null`
  // The DB CHECK constraint guarantees exactly one is non-null,
  // but TypeScript can't express that from the query result.
  type RawMemberRow = BaseMemberRow & {
    userId: string | null;
    organizationName: string | null;
    email: string | null;
    firstNames: string | null;
    lastName: string | null;
    homeMunicipality: string | null;
    preferredLanguage: "unspecified" | "finnish" | "english" | null;
    isAllowedEmails: boolean | null;
  };

  function isPersonMember(row: MemberRow): row is PersonMemberRow {
    return row.userId !== null;
  }

  /** Narrow raw server data (both fields nullable) to the discriminated union.
   *  The DB CHECK constraint guarantees exactly one of userId/organizationName is non-null. */
  function narrowMemberRow(raw: RawMemberRow): MemberRow {
    if (raw.userId !== null) {
      return raw as PersonMemberRow;
    }
    if (raw.organizationName === null) {
      throw new Error(`Member ${raw.id} has neither userId nor organizationName`);
    }
    return raw as AssociationMemberRow;
  }

  type Props = {
    data: RawMemberRow[];
    membershipTypes: MembershipType[];
    availableFeePeriods: Array<{
      id: string;
      membershipTypeId: string;
      membershipTypeName: LocalizedString;
      stripePriceId: string | null;
      startTime: Date;
      endTime: Date;
    }>;
    years: number[];
    canWrite: boolean;
  };

  let { data: rawData, membershipTypes, availableFeePeriods, years, canWrite }: Props = $props();

  const data = $derived(rawData.map(narrowMemberRow));

  // Helper to get localized membership type name
  function getLocalizedTypeName(name: LocalizedString | null): string {
    if (!name) return "-";
    return $locale === "fi" ? name.fi : name.en;
  }

  function getMembershipTypeName(id: string): string {
    return getLocalizedTypeName(membershipTypes.find((type) => type.id === id)?.name ?? null);
  }

  function formatObligationKind(
    kind: FeeHistoryItem["obligation"] extends infer T ? (T extends { kind: infer K } ? K : never) : never,
  ) {
    return {
      renewal: $LL.admin.members.table.obligationRenewal(),
      application: $LL.admin.members.table.obligationApplication(),
      type_change: $LL.admin.members.table.obligationTypeChange(),
    }[kind];
  }

  function formatObligationDisposition(disposition: NonNullable<FeeHistoryItem["obligation"]>["disposition"]) {
    return {
      required: $LL.admin.members.table.obligationRequired(),
      waived: $LL.admin.members.table.obligationWaived(),
      cancelled: $LL.admin.members.table.obligationCancelled(),
    }[disposition];
  }

  function formatPaymentStatus(payment: FeeHistoryItem["payments"][number]) {
    if (payment.invalidatedAt) return $LL.admin.members.table.paymentInvalidated();
    if (payment.refundConfirmedAt) return $LL.admin.members.table.paymentRefunded();
    if (payment.refundRequiredAt) return $LL.admin.members.table.paymentRefundRequired();
    return {
      pending: $LL.admin.members.table.paymentPending(),
      succeeded: $LL.admin.members.table.paymentSucceeded(),
      failed: $LL.admin.members.table.paymentFailed(),
      expired: $LL.admin.members.table.paymentExpired(),
    }[payment.status];
  }

  function formatMembershipEvent(eventType: MembershipEventItem["eventType"]) {
    return {
      application_submitted: $LL.admin.members.table.eventApplicationSubmitted(),
      application_approved: $LL.admin.members.table.eventApplicationApproved(),
      application_rejected: $LL.admin.members.table.eventApplicationRejected(),
      type_change_requested: $LL.admin.members.table.eventTypeChangeRequested(),
      type_changed: $LL.admin.members.table.eventTypeChanged(),
      type_change_rejected: $LL.admin.members.table.eventTypeChangeRejected(),
      resigned_voluntarily: $LL.admin.members.table.eventResignedVoluntarily(),
      deemed_resigned_nonpayment: $LL.admin.members.table.eventDeemedResignedNonpayment(),
      expelled: $LL.admin.members.table.eventExpelled(),
      legacy_membership_started_inferred: $LL.admin.members.table.eventLegacyMembershipStarted(),
      legacy_resignation_inferred: $LL.admin.members.table.eventLegacyResignation(),
      legacy_rejoin_inferred: $LL.admin.members.table.eventLegacyRejoin(),
      legacy_type_changed_inferred: $LL.admin.members.table.eventLegacyTypeChanged(),
      membership_decision_corrected: $LL.admin.members.table.eventMembershipDecisionCorrected(),
    }[eventType];
  }

  function formatEventSource(source: MembershipEventItem["source"]) {
    return {
      admin: $LL.admin.members.table.eventSourceAdmin(),
      system: $LL.admin.members.table.eventSourceSystem(),
      imported: $LL.admin.members.table.eventSourceImported(),
      migration: $LL.admin.members.table.eventSourceMigration(),
    }[source];
  }

  function getEventDetails(event: MembershipEventItem) {
    const details: string[] = [];
    if (event.data.fromMembershipTypeId && event.data.toMembershipTypeId) {
      details.push(
        `${getMembershipTypeName(event.data.fromMembershipTypeId)} → ${getMembershipTypeName(event.data.toMembershipTypeId)}`,
      );
    } else if (event.data.membershipTypeId) {
      details.push(getMembershipTypeName(event.data.membershipTypeId));
    }
    if (event.data.reason) details.push(event.data.reason);
    return details.join(" · ");
  }

  type MembershipActivityItem =
    | { kind: "event"; id: string; occurredAt: Date; event: MembershipEventItem }
    | {
        kind: "payment";
        id: string;
        occurredAt: Date;
        payment: FeeHistoryItem["payments"][number];
        feePeriod: FeeHistoryItem;
      };

  function getMembershipActivity(member: MemberRow): MembershipActivityItem[] {
    return [
      ...member.membershipEvents.map((event): MembershipActivityItem => ({
        kind: "event",
        id: `event-${event.id}`,
        occurredAt: event.effectiveAt,
        event,
      })),
      ...member.feeHistory.flatMap((feePeriod) =>
        feePeriod.payments.map((payment): MembershipActivityItem => ({
          kind: "payment",
          id: `payment-${payment.id}`,
          occurredAt: payment.paidAt ?? payment.createdAt,
          payment,
          feePeriod,
        })),
      ),
    ].toSorted((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
  }

  function formatPaymentSource(source: FeeHistoryItem["payments"][number]["source"]) {
    return {
      stripe: $LL.admin.members.table.paymentSourceStripe(),
      manual: $LL.admin.members.table.paymentSourceManual(),
      imported: $LL.admin.members.table.paymentSourceImported(),
    }[source];
  }

  // Reactive URL search params
  const urlParams = new SvelteURLSearchParams(page.url.searchParams);

  // Table state - synced with URL
  let sorting = $state<SortingState>(
    urlParams.get("sort") && urlParams.get("order")
      ? [{ id: urlParams.get("sort") ?? "", desc: urlParams.get("order") === "desc" }]
      : [],
  );
  let columnFilters = $state<ColumnFiltersState>([]);
  let globalFilter = $state(urlParams.get("search") ?? "");
  let expandedRows = $state<Set<string>>(new Set());
  let columnVisibility = $state<Record<string, boolean>>({
    feePeriodYears: false,
  });
  let pagination = $state({
    pageIndex: Number.parseInt(urlParams.get("page") ?? "0"),
    pageSize: Number.parseInt(urlParams.get("pageSize") ?? "100"),
  });
  let rowSelection = $state<RowSelectionState>({});

  // Bulk action state
  let bulkActionLoading = $state(false);

  // Confirmation dialog state — bulk actions
  let showApproveDialog = $state(false);
  let showDeemResignedDialog = $state(false);
  let deemResignedReason = $state($LL.admin.members.table.deemResignedDefaultReason());

  // Confirmation dialog state — individual actions
  type IndividualAction = "approve" | "deemResigned" | "resign" | "reject" | "reactivate";
  let individualAction = $state<{ type: IndividualAction; memberId: string; memberName: string } | null>(null);
  let individualReason = $state("");
  let individualActionLoading = $state(false);

  // Membership type correction state
  let typeChangeAction = $state<{
    memberId: string;
    memberName: string;
    member: MemberRow;
  } | null>(null);
  let targetFeePeriodId = $state("");
  let typeChangeLoading = $state(false);
  let typeChangeTargets = $state<typeof availableFeePeriods>([]);
  let typeChangeTargetsLoading = $state(false);
  let typeChangeTargetsError = $state(false);
  let typeChangeRequestId = 0;

  function getTypeChangeCandidates(member: MemberRow) {
    const source = availableFeePeriods.find((candidate) => candidate.id === member.correctionFeePeriodId);
    if (!source) return [];

    return availableFeePeriods.filter((candidate) => {
      return (
        candidate.id !== source.id &&
        candidate.membershipTypeId !== member.membershipTypeId &&
        candidate.startTime.getTime() === source.startTime.getTime() &&
        candidate.endTime.getTime() === source.endTime.getTime() &&
        candidate.stripePriceId !== null
      );
    });
  }

  function canChangeMemberType(member: MemberRow) {
    const source = availableFeePeriods.find((candidate) => candidate.id === member.correctionFeePeriodId);
    return Boolean(source?.stripePriceId && getTypeChangeCandidates(member).length > 0);
  }

  async function openTypeChange(member: MemberRow, memberName: string) {
    const requestId = ++typeChangeRequestId;
    typeChangeAction = { memberId: member.id, memberName, member };
    targetFeePeriodId = "";
    typeChangeTargets = [];
    typeChangeTargetsLoading = false;
    typeChangeTargetsError = false;

    const sourceFeePeriod = availableFeePeriods.find((candidate) => candidate.id === member.correctionFeePeriodId);
    if (!sourceFeePeriod?.stripePriceId) return;

    const candidates = getTypeChangeCandidates(member);
    const exactPriceTargets = candidates.filter(
      (candidate) => candidate.stripePriceId === sourceFeePeriod.stripePriceId,
    );
    const differingPriceTargets = candidates.filter(
      (candidate) => candidate.stripePriceId !== sourceFeePeriod.stripePriceId,
    );

    if (differingPriceTargets.length === 0) {
      typeChangeTargets = exactPriceTargets;
      targetFeePeriodId = exactPriceTargets[0]?.id ?? "";
      return;
    }

    typeChangeTargetsLoading = true;
    const priceIds = [
      sourceFeePeriod.stripePriceId,
      ...new Set(
        differingPriceTargets.flatMap((candidate) => (candidate.stripePriceId ? [candidate.stripePriceId] : [])),
      ),
    ];
    const priceResults = await Promise.allSettled(priceIds.map((priceId) => getStripePriceMetadata(priceId)));

    if (requestId !== typeChangeRequestId) return;

    const prices = new Map(
      priceResults.flatMap((result, index) =>
        result.status === "fulfilled" ? ([[priceIds[index], result.value]] as const) : [],
      ),
    );
    const currentPrice = prices.get(sourceFeePeriod.stripePriceId);
    const equalPriceTargets = differingPriceTargets.filter((candidate) => {
      if (!candidate.stripePriceId || currentPrice?.unitAmount === null || currentPrice?.unitAmount === undefined) {
        return false;
      }
      const candidatePrice = prices.get(candidate.stripePriceId);
      return (
        candidatePrice?.unitAmount !== null &&
        candidatePrice?.unitAmount === currentPrice.unitAmount &&
        candidatePrice.currency === currentPrice.currency
      );
    });

    typeChangeTargets = [...exactPriceTargets, ...equalPriceTargets];
    targetFeePeriodId = typeChangeTargets[0]?.id ?? "";
    typeChangeTargetsError = priceResults.some((result) => result.status === "rejected");
    typeChangeTargetsLoading = false;
  }

  async function confirmTypeChange() {
    if (!typeChangeAction || !targetFeePeriodId) return;

    typeChangeLoading = true;
    try {
      await changeMemberType({ memberId: typeChangeAction.memberId, targetFeePeriodId });
      typeChangeAction = null;
      targetFeePeriodId = "";
      toast.success($LL.admin.members.table.membershipTypeChanged());
      await invalidateAll();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String(error.message)
            : $LL.error.updateFailed();
      toast.error(message);
    } finally {
      typeChangeLoading = false;
    }
  }

  // Filter state - synced with URL
  let selectedYear = $state<string>(urlParams.get("year") ?? "all");
  let selectedType = $state<string>(urlParams.get("type") ?? "all");
  let selectedStatus = $state<string>(
    urlParams.get("status") === "resigned" ? "ended" : (urlParams.get("status") ?? "all"),
  );

  // Debounce timer for URL updates
  let updateTimer: ReturnType<typeof setTimeout> | null = null;

  // Sync state to URL with debouncing
  $effect(() => {
    // Track all reactive values
    void globalFilter;
    void selectedYear;
    void selectedType;
    void selectedStatus;
    void sorting;
    void pagination;

    // Clear existing timer
    if (updateTimer) clearTimeout(updateTimer);

    // Debounce URL updates to prevent flooding
    updateTimer = setTimeout(() => {
      // Clear all params first
      for (const key of Array.from(urlParams.keys())) {
        urlParams.delete(key);
      }

      // Add search if present
      if (globalFilter) urlParams.set("search", globalFilter);

      // Add filters if not "all"
      if (selectedYear !== "all") urlParams.set("year", selectedYear);
      if (selectedType !== "all") urlParams.set("type", selectedType);
      if (selectedStatus !== "all") urlParams.set("status", selectedStatus);

      // Add sorting if present
      if (isNonEmpty(sorting)) {
        urlParams.set("sort", sorting[0].id);
        urlParams.set("order", sorting[0].desc ? "desc" : "asc");
      }

      // Add pagination if not defaults
      if (pagination.pageIndex !== 0) urlParams.set("page", pagination.pageIndex.toString());
      if (pagination.pageSize !== 100) urlParams.set("pageSize", pagination.pageSize.toString());

      // Update URL without reloading
      const newUrl = `${page.url.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""}`;
      goto(newUrl, { replaceState: true, noScroll: true, keepFocus: true });
    }, 300); // 300ms debounce
  });

  // Copy to clipboard state
  let copySuccess = $state(false);
  let exportJasenetSuccess = $state(false);
  let exportAktiivitSuccess = $state(false);

  // Helper to strip email aliases (e.g., example+alias@domain.com -> example@domain.com)
  function stripEmailAlias(email: string): string {
    const atIndex = email.indexOf("@");
    if (atIndex === -1) return email;

    const localPart = email.slice(0, atIndex);
    const domain = email.slice(atIndex);

    const plusIndex = localPart.indexOf("+");
    if (plusIndex === -1) return email;

    return localPart.slice(0, plusIndex) + domain;
  }

  // Helper to copy filtered members as text
  async function copyMembersAsText() {
    const filteredRows = table.getFilteredRowModel().rows;

    // Group members by membership type
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const grouped = new Map<string, MemberRow[]>();
    for (const row of filteredRows) {
      const type = getLocalizedTypeName(row.original.membershipTypeName);
      if (!grouped.has(type)) {
        grouped.set(type, []);
      }
      const typeGroup = grouped.get(type);
      if (typeGroup) {
        typeGroup.push(row.original);
      }
    }

    // Build text output
    let text = "";
    for (const [type, members] of grouped) {
      text += `${type}:\n`;
      for (const member of members) {
        text += `  ${formatMemberName(member)}\n`;
      }
      text += "\n";
    }

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(text.trim());
      copySuccess = true;
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  // Helper to export filtered members as CSV (Google Groups format)
  function exportMembersAsCSV(groupEmail: "jasenet@tietokilta.fi" | "aktiivit@tietokilta.fi") {
    let filteredRows = table.getFilteredRowModel().rows;

    // For aktiivit@, only include members who have opted in for emails
    if (groupEmail === "aktiivit@tietokilta.fi") {
      filteredRows = filteredRows.filter((row) => row.original.isAllowedEmails === true);
    }

    // Google Groups CSV format: Group Email [Required],Member Email,Member Type,Member Role
    const csvRows = ["Group Email [Required],Member Email,Member Type,Member Role"];

    for (const row of filteredRows) {
      const rawEmail = row.original.email ?? "";
      if (!rawEmail) continue; // Skip members without email

      // Strip email aliases (example+alias@domain.com -> example@domain.com)
      const email = stripEmailAlias(rawEmail).replaceAll('"', '""'); // Also escape quotes

      // Every row has the same format, only email changes
      csvRows.push(`"${groupEmail}","${email}","User","Member"`);
    }

    const csvContent = csvRows.join("\n");

    // Create a blob and trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    // Generate filename with timestamp and group name
    const timestamp = new Date().toISOString().split("T", 1)[0];
    const groupName = groupEmail.split("@", 1)[0]; // Extract 'jasenet' or 'aktiivit'
    link.setAttribute("href", url);
    link.setAttribute("download", `${groupName}-export-${timestamp}.csv`);
    link.style.visibility = "hidden";

    document.body.append(link);
    link.click();
    link.remove();

    // Show success message
    if (groupEmail === "jasenet@tietokilta.fi") {
      exportJasenetSuccess = true;
      setTimeout(() => {
        exportJasenetSuccess = false;
      }, 2000);
    } else {
      exportAktiivitSuccess = true;
      setTimeout(() => {
        exportAktiivitSuccess = false;
      }, 2000);
    }
  }

  function getVisibleFeeHistory(feeHistory: FeeHistoryItem[]) {
    if (selectedYear === "all") return feeHistory;
    return feeHistory.filter((item) => item.startTime.getFullYear().toString() === selectedYear);
  }

  // Status color mapping
  function getStatusColor(status: MemberRow["status"]) {
    switch (status) {
      case "active":
        return "default";
      case "awaiting_payment":
        return "secondary";
      case "awaiting_approval":
        return "secondary";
      case "ended":
        return "destructive";
      case "rejected":
        return "outline";
      default:
        return "outline";
    }
  }

  // Format status for display using i18n
  function formatStatus(status: MemberRow["status"]) {
    const statusLabels = {
      active: $LL.admin.members.table.active(),
      ended: $LL.admin.members.table.resigned(),
      rejected: $LL.admin.members.table.rejected(),
      awaiting_approval: $LL.admin.members.table.awaitingApproval(),
      awaiting_payment: $LL.admin.members.table.awaitingPayment(),
    } as const;
    return statusLabels[status];
  }

  const yearFilterFn = (row: TanStackRow<typeof features, MemberRow>, columnId: string, filterValue: string) => {
    const feePeriodYears = row.getValue(columnId) as string[];
    return feePeriodYears.includes(filterValue);
  };

  // Column definitions
  const columns = $derived<ColumnDef<typeof features, MemberRow>[]>([
    // Only include select column if user has write access
    ...(canWrite
      ? [
          {
            id: "select",
            header: "",
            cell: ({ row }: { row: TanStackRow<typeof features, MemberRow> }) => row.original.id,
            enableSorting: false,
          } satisfies ColumnDef<typeof features, MemberRow>,
        ]
      : []),
    {
      id: "expand",
      header: "",
      cell: ({ row }) => row.original.id,
      enableSorting: false,
    },
    {
      id: "name",
      accessorFn: (row) => formatMemberName(row),
      header: $LL.admin.members.table.name(),
      enableSorting: true,
    },
    {
      accessorKey: "email",
      header: $LL.admin.members.table.email(),
      cell: ({ row }) => row.original.email ?? "-",
      enableSorting: true,
    },
    {
      accessorKey: "membershipTypeId",
      header: $LL.admin.members.table.membershipType(),
      cell: ({ row }) => getLocalizedTypeName(row.original.membershipTypeName),
      enableSorting: true,
      filterFn: filterFn_equals,
    },
    {
      accessorKey: "status",
      header: $LL.admin.members.table.status(),
      cell: ({ row }) => row.original.status,
      enableSorting: true,
      filterFn: filterFn_equals,
    },
    // Hidden column for filtering by year
    {
      accessorKey: "feePeriodYears",
      header: "",
      enableHiding: true,
      enableSorting: false,
      filterFn: yearFilterFn,
    },
  ]);

  // Apply filters
  $effect(() => {
    const filters: ColumnFiltersState = [];

    // Year filter
    if (selectedYear !== "all") {
      filters.push({
        id: "feePeriodYears",
        value: selectedYear,
      });
    }

    // Type filter
    if (selectedType !== "all") {
      filters.push({
        id: "membershipTypeId",
        value: selectedType,
      });
    }

    // Status filter
    if (selectedStatus !== "all") {
      filters.push({
        id: "status",
        value: selectedStatus,
      });
    }

    columnFilters = filters;
  });

  // Create table
  const table = createTable({
    features,
    get data() {
      return data;
    },
    get columns() {
      return columns;
    },
    state: {
      get sorting() {
        return sorting;
      },
      get columnFilters() {
        return columnFilters;
      },
      get globalFilter() {
        return globalFilter;
      },
      get columnVisibility() {
        return columnVisibility;
      },
      get pagination() {
        return pagination;
      },
      get rowSelection() {
        return rowSelection;
      },
    },
    onSortingChange: (updater) => {
      sorting = typeof updater === "function" ? updater(sorting) : updater;
    },
    onColumnFiltersChange: (updater) => {
      columnFilters = typeof updater === "function" ? updater(columnFilters) : updater;
    },
    onGlobalFilterChange: (updater) => {
      globalFilter = typeof updater === "function" ? updater(globalFilter) : updater;
    },
    onColumnVisibilityChange: (updater) => {
      columnVisibility = typeof updater === "function" ? updater(columnVisibility) : updater;
    },
    onPaginationChange: (updater) => {
      pagination = typeof updater === "function" ? updater(pagination) : updater;
    },
    onRowSelectionChange: (updater) => {
      rowSelection = typeof updater === "function" ? updater(rowSelection) : updater;
    },
    enableRowSelection: true,
    getRowId: (row) => row.id,
    globalFilterFn: (row, columnId, filterValue) => {
      const searchValue = filterValue.toLowerCase();
      const orgName = (row.original.organizationName ?? "").toLowerCase();
      const firstName = (row.original.firstNames ?? "").toLowerCase();
      const lastName = (row.original.lastName ?? "").toLowerCase();
      const email = (row.original.email ?? "").toLowerCase();
      const municipality = (row.original.homeMunicipality ?? "").toLowerCase();

      return (
        orgName.includes(searchValue) ||
        firstName.includes(searchValue) ||
        lastName.includes(searchValue) ||
        email.includes(searchValue) ||
        municipality.includes(searchValue)
      );
    },
  });

  // Helper to get selected member IDs
  function getSelectedMemberIds(): string[] {
    return Object.keys(rowSelection).filter((id) => rowSelection[id]);
  }

  // Helper to get the count of selected members by status
  function getSelectedMembersByStatus() {
    const selectedIds = getSelectedMemberIds();
    const selectedRows = table.getRowModel().rows.filter((row) => selectedIds.includes(row.id));

    const counts = {
      awaitingApproval: 0,
      active: 0,
      awaitingPayment: 0,
      ended: 0,
      rejected: 0,
      eligibleForDeemResigned: 0,
    };

    for (const row of selectedRows) {
      switch (row.original.status) {
        case "awaiting_approval":
          counts.awaitingApproval++;
          break;
        case "active":
          counts.active++;
          if (row.original.canBeDeemedResigned) {
            counts.eligibleForDeemResigned++;
          }
          break;
        case "awaiting_payment":
          counts.awaitingPayment++;
          break;
        case "ended":
          counts.ended++;
          break;
        case "rejected":
          counts.rejected++;
          break;
      }
    }

    return counts;
  }

  // Helper to format a member row as a display name
  function formatMemberName(row: MemberRow): string {
    if (!isPersonMember(row)) {
      return row.organizationName;
    }
    const firstName = row.firstNames ?? "";
    const lastName = row.lastName ?? "";
    return `${firstName} ${lastName}`.trim() || (row.email ?? row.id);
  }

  // Payment completion moves an application to awaiting_approval. Unpaid
  // awaiting_payment applications cannot be approved.
  function getSelectedApprovableMembers(): { ids: string[]; names: string[] } {
    const selectedIds = getSelectedMemberIds();
    const eligible = table
      .getRowModel()
      .rows.filter((row) => selectedIds.includes(row.id) && row.original.status === "awaiting_approval");
    return {
      ids: eligible.map((row) => row.id),
      names: eligible.map((row) => formatMemberName(row.original)),
    };
  }

  // Only active members with an actionable unpaid obligation can be deemed
  // resigned for non-payment under §8 p2.
  function getSelectedDeemResignedMembers(): { ids: string[]; names: string[] } {
    const selectedIds = getSelectedMemberIds();
    const eligible = table
      .getRowModel()
      .rows.filter(
        (row) => selectedIds.includes(row.id) && row.original.status === "active" && row.original.canBeDeemedResigned,
      );
    return {
      ids: eligible.map((row) => row.id),
      names: eligible.map((row) => formatMemberName(row.original)),
    };
  }

  // Bulk action handlers
  async function confirmBulkApprove() {
    const { ids: memberIds } = getSelectedApprovableMembers();
    if (memberIds.length === 0) return;

    bulkActionLoading = true;
    try {
      await bulkApproveMembers({ memberIds });
      rowSelection = {};
      showApproveDialog = false;
      await invalidateAll();
    } finally {
      bulkActionLoading = false;
    }
  }

  async function confirmBulkDeemResigned() {
    const { ids } = getSelectedDeemResignedMembers();
    if (ids.length === 0) return;

    bulkActionLoading = true;
    try {
      await bulkMarkMembersResigned({
        memberIds: ids,
        reason: deemResignedReason || undefined,
      });
      rowSelection = {};
      showDeemResignedDialog = false;
      await invalidateAll();
    } finally {
      bulkActionLoading = false;
    }
  }

  // Individual action helpers
  function openIndividualAction(type: IndividualAction, memberId: string, memberName: string) {
    individualAction = { type, memberId, memberName };
    individualReason = type === "deemResigned" ? $LL.admin.members.table.deemResignedDefaultReason() : "";
  }

  async function confirmIndividualAction() {
    if (!individualAction) return;

    const { type, memberId } = individualAction;
    const reason = individualReason || undefined;

    individualActionLoading = true;
    try {
      switch (type) {
        case "approve":
          await approveMember({ memberId });
          break;
        case "deemResigned":
          await markMemberResigned({ memberId, reason });
          break;
        case "resign":
          await resignMember({ memberId, reason });
          break;
        case "reject":
          await rejectMember({ memberId, reason });
          break;
        case "reactivate":
          await reactivateMember({ memberId, reason });
          break;
      }
      individualAction = null;
      await invalidateAll();
    } finally {
      individualActionLoading = false;
    }
  }

  function clearSelection() {
    rowSelection = {};
  }

  // Derived values for bulk action visibility
  const selectedCount = $derived(getSelectedMemberIds().length);
  const statusCounts = $derived(getSelectedMembersByStatus());
  const canApprove = $derived(statusCounts.awaitingApproval > 0);
  const canDeemResigned = $derived(statusCounts.eligibleForDeemResigned > 0);
</script>

<div class="space-y-4">
  <!-- Filters and Search -->
  <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div class="flex flex-wrap gap-2">
      <Input placeholder={$LL.admin.members.table.search()} type="search" class="max-w-sm" bind:value={globalFilter} />
      <Button variant="outline" size="default" onclick={copyMembersAsText}>
        {#if copySuccess}
          <Check class="mr-2 size-4" />
          {$LL.admin.members.table.copied()}
        {:else}
          <Copy class="mr-2 size-4" />
          {$LL.admin.members.table.copyAsText()}
        {/if}
      </Button>
      <Button variant="outline" size="default" onclick={() => exportMembersAsCSV("jasenet@tietokilta.fi")}>
        {#if exportJasenetSuccess}
          <Check class="mr-2 size-4" />
          {$LL.admin.members.table.exported()}
        {:else}
          <Download class="mr-2 size-4" />
          {$LL.admin.members.table.exportJasenet()}
        {/if}
      </Button>
      <Button variant="outline" size="default" onclick={() => exportMembersAsCSV("aktiivit@tietokilta.fi")}>
        {#if exportAktiivitSuccess}
          <Check class="mr-2 size-4" />
          {$LL.admin.members.table.exported()}
        {:else}
          <Download class="mr-2 size-4" />
          {$LL.admin.members.table.exportAktiivit()}
        {/if}
      </Button>
    </div>
    <div class="flex flex-col gap-3">
      <!-- Year Filter -->
      <div class="flex flex-wrap gap-2">
        <span class="text-sm font-medium">{$LL.admin.members.table.filterYear()}</span>
        <Button
          variant={selectedYear === "all" ? "default" : "outline"}
          size="sm"
          onclick={() => (selectedYear = "all")}
        >
          {$LL.admin.members.table.all()}
        </Button>
        {#each years as year (year)}
          <Button
            variant={selectedYear === year.toString() ? "default" : "outline"}
            size="sm"
            onclick={() => (selectedYear = year.toString())}
          >
            {year}
          </Button>
        {/each}
      </div>

      <!-- Type Filter -->
      <div class="flex flex-wrap gap-2">
        <span class="text-sm font-medium">{$LL.admin.members.table.filterType()}</span>
        <Button
          variant={selectedType === "all" ? "default" : "outline"}
          size="sm"
          onclick={() => (selectedType = "all")}
        >
          {$LL.admin.members.table.all()}
        </Button>
        {#each membershipTypes as type (type.id)}
          <Button
            variant={selectedType === type.id ? "default" : "outline"}
            size="sm"
            onclick={() => (selectedType = type.id)}
          >
            {$locale === "fi" ? type.name.fi : type.name.en}
          </Button>
        {/each}
      </div>

      <!-- Status Filter -->
      <div class="flex flex-wrap gap-2">
        <span class="text-sm font-medium">{$LL.admin.members.table.filterStatus()}</span>
        <Button
          variant={selectedStatus === "all" ? "default" : "outline"}
          size="sm"
          onclick={() => (selectedStatus = "all")}
        >
          {$LL.admin.members.table.all()}
        </Button>
        <Button
          variant={selectedStatus === "active" ? "default" : "outline"}
          size="sm"
          onclick={() => (selectedStatus = "active")}
        >
          {$LL.admin.members.table.active()}
        </Button>
        <Button
          variant={selectedStatus === "ended" ? "default" : "outline"}
          size="sm"
          onclick={() => (selectedStatus = "ended")}
        >
          {$LL.admin.members.table.resigned()}
        </Button>
        <Button
          variant={selectedStatus === "rejected" ? "default" : "outline"}
          size="sm"
          onclick={() => (selectedStatus = "rejected")}
        >
          {$LL.admin.members.table.rejected()}
        </Button>
        <Button
          variant={selectedStatus === "awaiting_approval" ? "default" : "outline"}
          size="sm"
          onclick={() => (selectedStatus = "awaiting_approval")}
        >
          {$LL.admin.members.table.awaitingApproval()}
        </Button>
        <Button
          variant={selectedStatus === "awaiting_payment" ? "default" : "outline"}
          size="sm"
          onclick={() => (selectedStatus = "awaiting_payment")}
        >
          {$LL.admin.members.table.awaitingPayment()}
        </Button>
      </div>
    </div>
  </div>

  <!-- Bulk Action Toolbar (only for admins with write access) -->
  {#if canWrite && selectedCount > 0}
    <div class="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 p-3" data-testid="bulk-action-toolbar">
      <span class="text-sm font-medium">
        {$LL.admin.members.table.selectedCount({ count: selectedCount })}
      </span>
      <div class="flex flex-wrap gap-2">
        {#if canApprove}
          <Button
            size="sm"
            variant="default"
            onclick={() => (showApproveDialog = true)}
            disabled={bulkActionLoading}
            data-testid="bulk-approve-button"
          >
            {$LL.admin.members.table.bulkApprove({
              count: statusCounts.awaitingApproval,
            })}
          </Button>
        {/if}
        {#if canDeemResigned}
          <Button
            size="sm"
            variant="outline"
            onclick={() => {
              deemResignedReason = $LL.admin.members.table.deemResignedDefaultReason();
              showDeemResignedDialog = true;
            }}
            disabled={bulkActionLoading}
            data-testid="bulk-deem-resigned-button"
          >
            {$LL.admin.members.table.bulkDeemResigned({ count: statusCounts.eligibleForDeemResigned })}
          </Button>
        {/if}
      </div>
      <Button size="sm" variant="ghost" onclick={clearSelection} disabled={bulkActionLoading}>
        {$LL.admin.members.table.clearSelection()}
      </Button>
    </div>
  {/if}

  <!-- Table -->
  <div class="rounded-md border">
    <Table.Root>
      <Table.Header>
        {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
          <Table.Row>
            {#each headerGroup.headers as header (header.id)}
              <Table.Head>
                {#if header.column.id === "select"}
                  <Checkbox
                    checked={table.getIsAllPageRowsSelected()}
                    indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label={$LL.admin.members.table.selectAll()}
                    data-testid="select-all-checkbox"
                  />
                {:else if !header.isPlaceholder}
                  {#if header.column.getCanSort()}
                    <Button
                      variant="ghost"
                      size="sm"
                      class="-ml-3 h-8 data-[state=open]:bg-accent"
                      onclick={() => header.column.toggleSorting()}
                    >
                      <FlexRender {header} />
                      <ArrowUpDown class="ml-2 size-4" />
                    </Button>
                  {:else}
                    <FlexRender {header} />
                  {/if}
                {/if}
              </Table.Head>
            {/each}
          </Table.Row>
        {/each}
      </Table.Header>
      <Table.Body>
        {#each table.getRowModel().rows as row (row.id)}
          <Table.Row data-state={row.getIsSelected() ? "selected" : undefined}>
            {#each row.getVisibleCells() as cell (cell.id)}
              <Table.Cell>
                {#if cell.column.id === "select"}
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label={$LL.admin.members.table.selectRow()}
                    data-testid="row-select-checkbox"
                  />
                {:else if cell.column.id === "expand"}
                  {@const expandKey = row.original.userId ?? row.original.id}
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => {
                      if (expandedRows.has(expandKey)) {
                        const newSet = new Set(expandedRows);
                        newSet.delete(expandKey);
                        expandedRows = newSet;
                      } else {
                        expandedRows = new Set([...expandedRows, expandKey]);
                      }
                    }}
                  >
                    {#if expandedRows.has(expandKey)}
                      <ChevronDown class="size-4" />
                    {:else}
                      <ChevronRight class="size-4" />
                    {/if}
                  </Button>
                {:else if cell.column.id === "status"}
                  <Badge variant={getStatusColor(row.original.status)}>
                    {formatStatus(row.original.status)}
                  </Badge>
                {:else if cell.column.id === "membershipTypeId"}
                  <span>{getLocalizedTypeName(row.original.membershipTypeName)}</span>
                {:else}
                  <FlexRender {cell} />
                {/if}
              </Table.Cell>
            {/each}
          </Table.Row>
          {#if expandedRows.has(row.original.userId ?? row.original.id)}
            {@const visibleFeeHistory = getVisibleFeeHistory(row.original.feeHistory)}
            {@const membershipActivity = getMembershipActivity(row.original)}
            {@const memberName = formatMemberName(row.original)}
            <Table.Row class="bg-muted/50">
              <Table.Cell colspan={columns.length}>
                <div class="p-4">
                  <!-- Details section: User Details for persons, Organization Details for associations -->
                  {#if isPersonMember(row.original)}
                    <div class="mb-4 space-y-2">
                      <h4 class="font-semibold">{$LL.admin.members.table.userDetails()}</h4>
                      <dl class="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.table.userIdLabel()}</dt>
                          <dd class="font-mono">{row.original.userId}</dd>
                        </div>
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.table.emailLabel()}</dt>
                          <dd>{row.original.email ?? "-"}</dd>
                        </div>
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.table.municipalityLabel()}</dt>
                          <dd>{row.original.homeMunicipality ?? "-"}</dd>
                        </div>
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.table.preferredLanguageLabel()}</dt>
                          <dd>
                            {#if row.original.preferredLanguage === "finnish"}
                              {$LL.user.preferredLanguageOptions.finnish()}
                            {:else if row.original.preferredLanguage === "english"}
                              {$LL.user.preferredLanguageOptions.english()}
                            {:else}
                              {$LL.user.preferredLanguageOptions.unspecified()}
                            {/if}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.table.emailAllowedLabel()}</dt>
                          <dd>
                            {row.original.isAllowedEmails
                              ? $LL.admin.members.table.yes()
                              : $LL.admin.members.table.no()}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  {:else}
                    <div class="mb-4 space-y-2">
                      <h4 class="font-semibold">{$LL.admin.members.organizationDetails()}</h4>
                      <dl class="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.organizationName()}</dt>
                          <dd>{row.original.organizationName}</dd>
                        </div>
                      </dl>
                    </div>
                  {/if}

                  <div class="mb-4 space-y-3">
                    <h4 class="font-semibold">{$LL.admin.members.table.legalMembership()}</h4>
                    <div class="rounded-md border p-4">
                      <dl class="grid gap-2 text-sm md:grid-cols-4">
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.table.typeLabel()}</dt>
                          <dd class="font-medium">{getLocalizedTypeName(row.original.membershipTypeName)}</dd>
                        </div>
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.table.statusLabel()}</dt>
                          <dd>
                            <Badge variant={getStatusColor(row.original.status)}
                              >{formatStatus(row.original.status)}</Badge
                            >
                          </dd>
                        </div>
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.table.membershipStartedLabel()}</dt>
                          <dd>
                            {row.original.currentMembershipStartedAt
                              ? formatDate(row.original.currentMembershipStartedAt, $locale)
                              : "-"}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.table.membershipEndedLabel()}</dt>
                          <dd>
                            {row.original.currentMembershipEndedAt
                              ? formatDate(row.original.currentMembershipEndedAt, $locale)
                              : "-"}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-muted-foreground">{$LL.admin.members.table.createdLabel()}</dt>
                          <dd>{formatDate(row.original.createdAt, $locale)}</dd>
                        </div>
                        {#if row.original.applicationMotive}
                          <div class="md:col-span-3">
                            <dt class="text-muted-foreground">{$LL.admin.members.table.descriptionLabel()}</dt>
                            <dd class="whitespace-pre-wrap">{row.original.applicationMotive}</dd>
                          </div>
                        {/if}
                      </dl>

                      {#if canWrite}
                        <div class="mt-3 flex flex-wrap gap-2 border-t pt-3">
                          {#if (row.original.status === "active" || row.original.status === "awaiting_approval") && canChangeMemberType(row.original)}
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`change-membership-type-${row.original.id}`}
                              onclick={() => openTypeChange(row.original, memberName)}
                              >{$LL.admin.members.table.changeMembershipType()}</Button
                            >
                          {/if}
                          {#if row.original.status === "awaiting_approval"}
                            <Button
                              size="sm"
                              onclick={() => openIndividualAction("approve", row.original.id, memberName)}
                              >{$LL.admin.members.table.approve()}</Button
                            >
                            <Button
                              size="sm"
                              variant="destructive"
                              onclick={() => openIndividualAction("reject", row.original.id, memberName)}
                              >{$LL.admin.members.table.reject()}</Button
                            >
                          {:else if row.original.status === "ended"}
                            <Button
                              size="sm"
                              onclick={() => openIndividualAction("reactivate", row.original.id, memberName)}
                              >{$LL.admin.members.table.reactivate()}</Button
                            >
                          {:else if row.original.status === "active"}
                            {#if row.original.canBeDeemedResigned}
                              <Button
                                size="sm"
                                variant="outline"
                                onclick={() => openIndividualAction("deemResigned", row.original.id, memberName)}
                              >
                                {$LL.admin.members.table.deemResigned() +
                                  " (" +
                                  page.data.customizations.memberResignRule +
                                  ")"}
                              </Button>
                            {/if}
                            <Button
                              size="sm"
                              variant="destructive"
                              onclick={() => openIndividualAction("resign", row.original.id, memberName)}
                            >
                              {$LL.admin.members.table.resignMembership() +
                                " (" +
                                page.data.customizations.memberResignRule +
                                ")"}
                            </Button>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>

                  <div class="mb-4 space-y-3">
                    <h4 class="font-semibold">{$LL.admin.members.table.activityHistory()}</h4>
                    {#if membershipActivity.length === 0}
                      <p class="text-sm text-muted-foreground">{$LL.admin.members.table.noActivityHistory()}</p>
                    {:else}
                      <ol class="space-y-2">
                        {#each membershipActivity as activity (activity.id)}
                          <li class="rounded-md border p-3 text-sm">
                            {#if activity.kind === "event"}
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <div class="flex flex-wrap items-center gap-2">
                                  <span class="font-medium">{formatMembershipEvent(activity.event.eventType)}</span>
                                  <Badge variant={activity.event.certainty === "inferred" ? "secondary" : "outline"}>
                                    {activity.event.certainty === "inferred"
                                      ? $LL.admin.members.table.eventInferred()
                                      : $LL.admin.members.table.eventConfirmed()}
                                  </Badge>
                                </div>
                                <time>{formatDate(activity.occurredAt, $locale)}</time>
                              </div>
                              <div class="mt-1 text-muted-foreground">
                                {formatEventSource(activity.event.source)}{activity.event.actorName
                                  ? ` · ${activity.event.actorName}`
                                  : ""}
                                {#if activity.event.feePeriodStartTime && activity.event.feePeriodEndTime}
                                  · {formatDate(activity.event.feePeriodStartTime, $locale)} – {formatDate(
                                    activity.event.feePeriodEndTime,
                                    $locale,
                                  )}
                                {/if}
                              </div>
                              {@const details = getEventDetails(activity.event)}
                              {#if details}<div class="mt-1">{details}</div>{/if}
                            {:else}
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <div class="flex flex-wrap items-center gap-2">
                                  <span class="font-medium">{$LL.admin.members.table.paymentEvent()}</span>
                                  <Badge variant="outline">{formatPaymentStatus(activity.payment)}</Badge>
                                </div>
                                <time>{formatDate(activity.occurredAt, $locale)}</time>
                              </div>
                              <div class="mt-1 text-muted-foreground">
                                {formatPaymentSource(activity.payment.source)} · {getMembershipTypeName(
                                  activity.feePeriod.membershipTypeId,
                                )} ·
                                {formatDate(activity.feePeriod.startTime, $locale)} – {formatDate(
                                  activity.feePeriod.endTime,
                                  $locale,
                                )}
                              </div>
                              <div class="mt-1 flex flex-wrap gap-x-3">
                                {#if activity.payment.amount !== null && activity.payment.currency}
                                  <span
                                    >{(activity.payment.amount / 100).toFixed(2)}
                                    {activity.payment.currency.toUpperCase()}</span
                                  >
                                {/if}
                                <span class="font-mono text-xs"
                                  >{activity.payment.stripeSessionId ?? activity.payment.id}</span
                                >
                              </div>
                            {/if}
                          </li>
                        {/each}
                      </ol>
                    {/if}
                  </div>

                  <div class="space-y-3">
                    <h4 class="font-semibold">{$LL.admin.members.table.feeHistory()}</h4>
                    {#if visibleFeeHistory.length === 0}
                      <p class="text-sm text-muted-foreground">{$LL.admin.members.table.noFeeHistory()}</p>
                    {:else}
                      <div class="space-y-3">
                        {#each visibleFeeHistory as feePeriod (feePeriod.id)}
                          <div class="rounded-md border p-4">
                            <dl class="grid gap-2 text-sm md:grid-cols-3">
                              <div>
                                <dt class="text-muted-foreground">{$LL.admin.members.table.typeLabel()}</dt>
                                <dd class="font-medium">{getMembershipTypeName(feePeriod.membershipTypeId)}</dd>
                              </div>
                              <div>
                                <dt class="text-muted-foreground">{$LL.admin.members.table.periodLabel()}</dt>
                                <dd>
                                  {formatDate(feePeriod.startTime, $locale)} – {formatDate(feePeriod.endTime, $locale)}
                                </dd>
                              </div>
                              <div>
                                <dt class="text-muted-foreground">{$LL.admin.members.table.priceLabel()}</dt>
                                <dd class="font-mono text-xs">{feePeriod.stripePriceId ?? "-"}</dd>
                              </div>
                              <div>
                                <dt class="text-muted-foreground">{$LL.admin.members.table.obligationLabel()}</dt>
                                <dd>
                                  {#if feePeriod.obligation}
                                    {formatObligationKind(feePeriod.obligation.kind)} · {formatObligationDisposition(
                                      feePeriod.obligation.disposition,
                                    )}
                                  {:else}
                                    {$LL.admin.members.table.noObligation()}
                                  {/if}
                                </dd>
                              </div>
                              {#if feePeriod.obligation?.dispositionReason}
                                <div class="md:col-span-2">
                                  <dt class="text-muted-foreground">{$LL.admin.members.table.reasonLabel()}</dt>
                                  <dd>{feePeriod.obligation.dispositionReason}</dd>
                                </div>
                              {/if}
                            </dl>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              </Table.Cell>
            </Table.Row>
          {/if}
        {/each}
      </Table.Body>
    </Table.Root>
  </div>

  <!-- Pagination -->
  <div class="flex items-center justify-between">
    <div class="text-sm text-muted-foreground">
      {$LL.admin.members.table.showing({
        start: pagination.pageIndex * pagination.pageSize + 1,
        end: Math.min((pagination.pageIndex + 1) * pagination.pageSize, table.getFilteredRowModel().rows.length),
        total: table.getFilteredRowModel().rows.length,
      })}
    </div>
    <div class="flex gap-2">
      <Button variant="outline" size="sm" onclick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
        {$LL.admin.members.table.previous()}
      </Button>
      <Button variant="outline" size="sm" onclick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
        {$LL.admin.members.table.next()}
      </Button>
    </div>
  </div>
</div>

<!-- Bulk Approve Confirmation Dialog -->
<AlertDialog.Root bind:open={showApproveDialog}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>
        {$LL.admin.members.table.confirmApproveTitle({
          count: statusCounts.awaitingApproval,
        })}
      </AlertDialog.Title>
      <AlertDialog.Description>
        {$LL.admin.members.table.confirmApproveDescription()}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <ul class="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
      {#each getSelectedApprovableMembers().names as name, i (i)}
        <li>{name}</li>
      {/each}
    </ul>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={bulkActionLoading}>
        {$LL.admin.members.table.cancel()}
      </AlertDialog.Cancel>
      <AlertDialog.Action onclick={confirmBulkApprove} disabled={bulkActionLoading}>
        {$LL.admin.members.table.confirm()}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<!-- Membership Type Correction Dialog -->
<AlertDialog.Root
  open={typeChangeAction !== null}
  onOpenChange={(open) => {
    if (open) return;
    typeChangeRequestId++;
    typeChangeAction = null;
    targetFeePeriodId = "";
    typeChangeTargets = [];
    typeChangeTargetsLoading = false;
    typeChangeTargetsError = false;
  }}
>
  <AlertDialog.Content>
    {#if typeChangeAction}
      <AlertDialog.Header>
        <AlertDialog.Title>{$LL.admin.members.table.changeMembershipTypeTitle()}</AlertDialog.Title>
        <AlertDialog.Description>
          {$LL.admin.members.table.changeMembershipTypeDescription({ name: typeChangeAction.memberName })}
        </AlertDialog.Description>
      </AlertDialog.Header>

      {#if typeChangeTargetsLoading}
        <p class="text-sm text-muted-foreground">{$LL.common.loading()}</p>
      {:else if typeChangeTargets.length > 0}
        <div class="space-y-2">
          <label for="target-membership-type" class="text-sm font-medium">
            {$LL.admin.members.table.newMembershipType()}
          </label>
          <NativeSelect.Root id="target-membership-type" bind:value={targetFeePeriodId}>
            {#each typeChangeTargets as target (target.id)}
              <NativeSelect.Option value={target.id}>
                {getLocalizedTypeName(target.membershipTypeName)}
              </NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
        </div>
      {:else if !typeChangeTargetsError}
        <p class="text-sm text-muted-foreground" data-testid="no-compatible-membership-type">
          {$LL.admin.members.table.noCompatibleMembershipType()}
        </p>
      {/if}

      {#if typeChangeTargetsError}
        <p class="text-sm text-destructive">{$LL.admin.memberships.failedToLoadPrice()}</p>
      {/if}

      <p class="text-sm text-muted-foreground">
        {$LL.admin.members.table.changeMembershipTypeNote()}
      </p>

      <AlertDialog.Footer>
        <AlertDialog.Cancel disabled={typeChangeLoading}>
          {$LL.admin.members.table.cancel()}
        </AlertDialog.Cancel>
        <AlertDialog.Action
          data-testid="confirm-membership-type-change"
          onclick={confirmTypeChange}
          disabled={typeChangeLoading || typeChangeTargetsLoading || !targetFeePeriodId}
        >
          {$LL.admin.members.table.confirm()}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    {/if}
  </AlertDialog.Content>
</AlertDialog.Root>

<!-- Bulk Deem Resigned Confirmation Dialog -->
<AlertDialog.Root bind:open={showDeemResignedDialog}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>
        {$LL.admin.members.table.confirmDeemResignedTitle({
          count: statusCounts.eligibleForDeemResigned,
        })}
      </AlertDialog.Title>
      <AlertDialog.Description>
        {$LL.admin.members.table.confirmDeemResignedDescription()}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <ul class="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
      {#each getSelectedDeemResignedMembers().names as name, i (i)}
        <li>{name}</li>
      {/each}
    </ul>
    <div class="space-y-2">
      <label for="deem-resigned-reason" class="text-sm font-medium">
        {$LL.admin.members.table.reasonLabel()}
      </label>
      <Input id="deem-resigned-reason" bind:value={deemResignedReason} class="text-sm" />
    </div>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={bulkActionLoading}>
        {$LL.admin.members.table.cancel()}
      </AlertDialog.Cancel>
      <AlertDialog.Action onclick={confirmBulkDeemResigned} disabled={bulkActionLoading}>
        {$LL.admin.members.table.confirm()}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<!-- Individual Action Confirmation Dialog -->
<AlertDialog.Root
  open={individualAction !== null}
  onOpenChange={(open) => {
    if (!open) individualAction = null;
  }}
>
  <AlertDialog.Content>
    {#if individualAction}
      <AlertDialog.Header>
        <AlertDialog.Title>
          {#if individualAction.type === "approve"}
            {$LL.admin.members.table.confirmApproveSingleTitle()}
          {:else if individualAction.type === "deemResigned"}
            {$LL.admin.members.table.confirmDeemResignedSingleTitle()}
          {:else if individualAction.type === "resign"}
            {$LL.admin.members.table.confirmResignSingleTitle()}
          {:else if individualAction.type === "reject"}
            {$LL.admin.members.table.confirmRejectSingleTitle()}
          {:else}
            {$LL.admin.members.table.confirmReactivateSingleTitle()}
          {/if}
        </AlertDialog.Title>
        <AlertDialog.Description>
          {#if individualAction.type === "approve"}
            {$LL.admin.members.table.confirmApproveSingleDescription({ name: individualAction.memberName })}
          {:else if individualAction.type === "deemResigned"}
            {$LL.admin.members.table.confirmDeemResignedSingleDescription({ name: individualAction.memberName })}
          {:else if individualAction.type === "resign"}
            {$LL.admin.members.table.confirmResignSingleDescription({ name: individualAction.memberName })}
          {:else if individualAction.type === "reject"}
            {$LL.admin.members.table.confirmRejectSingleDescription({ name: individualAction.memberName })}
          {:else}
            {$LL.admin.members.table.confirmReactivateSingleDescription({ name: individualAction.memberName })}
          {/if}
        </AlertDialog.Description>
      </AlertDialog.Header>
      {#if individualAction.type !== "approve"}
        <div class="space-y-2">
          <label for="individual-reason" class="text-sm font-medium">
            {$LL.admin.members.table.reasonLabel()}
          </label>
          <Input id="individual-reason" bind:value={individualReason} class="text-sm" />
        </div>
      {/if}
      <AlertDialog.Footer>
        <AlertDialog.Cancel disabled={individualActionLoading}>
          {$LL.admin.members.table.cancel()}
        </AlertDialog.Cancel>
        <AlertDialog.Action onclick={confirmIndividualAction} disabled={individualActionLoading}>
          {$LL.admin.members.table.confirm()}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    {/if}
  </AlertDialog.Content>
</AlertDialog.Root>
