<script lang="ts">
  import { createSvelteTable, FlexRender } from "$lib/components/ui/data-table";
  import * as Table from "$lib/components/ui/table";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import {
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type ColumnDef,
    type SortingState,
    type ColumnFiltersState,
    type RowSelectionState,
    type Row as TanStackRow,
  } from "@tanstack/table-core";
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
  import { isNonEmpty } from "$lib/utils";
  import {
    approveMember,
    rejectMember,
    markMemberResigned,
    resignMember,
    reactivateMember,
    bulkApproveMembers,
    bulkMarkMembersResigned,
  } from "./data.remote";
  import { memberIdSchema } from "./schema";
  import type { LocalizedString, MembershipType } from "$lib/server/db/schema";

  type MemberRow = {
    id: string;
    userId: string;
    membershipId: string;
    status: "awaiting_payment" | "awaiting_approval" | "active" | "resigned" | "rejected";
    stripeSessionId: string | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    email: string | null;
    firstNames: string | null;
    lastName: string | null;
    homeMunicipality: string | null;
    preferredLanguage: "unspecified" | "finnish" | "english" | null;
    isAllowedEmails: boolean | null;
    membershipTypeId: string | null;
    membershipTypeName: LocalizedString | null;
    membershipStripePriceId: string | null;
    membershipStartTime: Date | null;
    membershipEndTime: Date | null;
    // Grouped membership data
    allMemberships: Array<{
      id: string;
      membershipId: string;
      status: "awaiting_payment" | "awaiting_approval" | "active" | "resigned" | "rejected";
      stripeSessionId: string | null;
      description: string | null;
      createdAt: Date;
      updatedAt: Date;
      membershipTypeId: string | null;
      membershipTypeName: LocalizedString | null;
      membershipStripePriceId: string | null;
      membershipStartTime: Date | null;
      membershipEndTime: Date | null;
    }>;
    membershipCount: number;
  };

  type Props = {
    data: MemberRow[];
    membershipTypes: MembershipType[];
    years: number[];
  };

  let { data, membershipTypes, years }: Props = $props();

  // Helper to get localized membership type name
  function getLocalizedTypeName(name: LocalizedString | null): string {
    if (!name) return "-";
    return $locale === "fi" ? name.fi : name.en;
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
    membershipStartTime: false, // Hide the filter column
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
  let deemResignedReason = $state("Eronneeksi katsominen (sääntöjen 8 § 2 mom.) — jäsenmaksu maksamatta");

  // Confirmation dialog state — individual actions
  type IndividualAction = "deemResigned" | "resign" | "reject" | "reactivate";
  let individualAction = $state<{ type: IndividualAction; memberId: string; memberName: string } | null>(null);
  let individualReason = $state("");
  let individualActionLoading = $state(false);

  // Filter state - synced with URL
  let selectedYear = $state<string>(urlParams.get("year") ?? "all");
  let selectedType = $state<string>(urlParams.get("type") ?? "all");
  let selectedStatus = $state<string>(urlParams.get("status") ?? "all");

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
        const firstName = member.firstNames ?? "";
        const lastName = member.lastName ?? "";
        text += `  ${firstName} ${lastName}\n`;
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
    const timestamp = new Date().toISOString().split("T")[0];
    const groupName = groupEmail.split("@")[0]; // Extract 'jasenet' or 'aktiivit'
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

  // Helper to filter memberships based on current filters
  function getFilteredMemberships(allMemberships: MemberRow["allMemberships"]) {
    return allMemberships.filter((membership) => {
      // Year filter
      if (selectedYear !== "all") {
        const membershipYear = membership.membershipStartTime?.getFullYear().toString();
        if (membershipYear !== selectedYear) return false;
      }

      // Type filter
      if (selectedType !== "all" && membership.membershipTypeId !== selectedType) return false;

      // Status filter
      if (selectedStatus !== "all" && membership.status !== selectedStatus) return false;

      return true;
    });
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
      case "resigned":
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
      resigned: $LL.admin.members.table.resigned(),
      rejected: $LL.admin.members.table.rejected(),
      awaiting_approval: $LL.admin.members.table.awaitingApproval(),
      awaiting_payment: $LL.admin.members.table.awaitingPayment(),
    } as const;
    return statusLabels[status];
  }

  // Custom filter function for year
  const yearFilterFn = (row: TanStackRow<MemberRow>, columnId: string, filterValue: string) => {
    const startTime = row.getValue(columnId) as Date | null;
    if (!startTime) return false;
    const year = startTime.getFullYear().toString();
    return year === filterValue;
  };

  // Column definitions
  const columns = $derived<ColumnDef<MemberRow>[]>([
    {
      id: "select",
      header: "",
      cell: ({ row }) => row.original.id,
      enableSorting: false,
    },
    {
      id: "expand",
      header: "",
      cell: ({ row }) => row.original.id,
      enableSorting: false,
    },
    {
      accessorKey: "firstNames",
      header: $LL.admin.members.table.firstNames(),
      cell: ({ row }) => row.original.firstNames ?? "-",
      enableSorting: true,
    },
    {
      accessorKey: "lastName",
      header: $LL.admin.members.table.lastName(),
      cell: ({ row }) => row.original.lastName ?? "-",
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
    },
    {
      accessorKey: "status",
      header: $LL.admin.members.table.status(),
      cell: ({ row }) => row.original.status,
      enableSorting: true,
    },
    // Hidden column for filtering by year
    {
      accessorKey: "membershipStartTime",
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
        id: "membershipStartTime",
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
  const table = $derived(
    createSvelteTable({
      data,
      columns,
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
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      globalFilterFn: (row, columnId, filterValue) => {
        const searchValue = filterValue.toLowerCase();
        const firstName = (row.original.firstNames ?? "").toLowerCase();
        const lastName = (row.original.lastName ?? "").toLowerCase();
        const email = (row.original.email ?? "").toLowerCase();
        const municipality = (row.original.homeMunicipality ?? "").toLowerCase();

        return (
          firstName.includes(searchValue) ||
          lastName.includes(searchValue) ||
          email.includes(searchValue) ||
          municipality.includes(searchValue)
        );
      },
    }),
  );

  // Helper to get selected member IDs
  function getSelectedMemberIds(): string[] {
    return Object.keys(rowSelection).filter((id) => rowSelection[id]);
  }

  // Check if a membership period has ended (endTime is in the past)
  function isMembershipPeriodEnded(endTime: Date | null): boolean {
    if (!endTime) return false;
    return endTime < new Date();
  }

  // Helper to get the count of selected members by status
  function getSelectedMembersByStatus() {
    const selectedIds = getSelectedMemberIds();
    const selectedRows = table.getRowModel().rows.filter((row) => selectedIds.includes(row.id));

    const counts = {
      awaitingApproval: 0,
      active: 0,
      awaitingPayment: 0,
      resigned: 0,
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
          if (isMembershipPeriodEnded(row.original.membershipEndTime)) {
            counts.eligibleForDeemResigned++;
          }
          break;
        case "awaiting_payment":
          counts.awaitingPayment++;
          break;
        case "resigned":
          counts.resigned++;
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
    const firstName = row.firstNames ?? "";
    const lastName = row.lastName ?? "";
    return `${firstName} ${lastName}`.trim() || (row.email ?? row.id);
  }

  // Helper to get selected member names for confirmation dialogs
  function getSelectedMemberNames(): string[] {
    const selectedIds = getSelectedMemberIds();
    return table
      .getRowModel()
      .rows.filter((row) => selectedIds.includes(row.id))
      .map((row) => formatMemberName(row.original));
  }

  // Helper to get selected members eligible for deem resigned
  // Only active members whose membership period has ended
  function getSelectedDeemResignedMembers(): { ids: string[]; names: string[] } {
    const selectedIds = getSelectedMemberIds();
    const eligible = table
      .getRowModel()
      .rows.filter(
        (row) =>
          selectedIds.includes(row.id) &&
          row.original.status === "active" &&
          isMembershipPeriodEnded(row.original.membershipEndTime),
      );
    return {
      ids: eligible.map((row) => row.id),
      names: eligible.map((row) => formatMemberName(row.original)),
    };
  }

  // Bulk action handlers
  async function confirmBulkApprove() {
    const memberIds = getSelectedMemberIds();
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
    individualReason =
      type === "deemResigned" ? "Eronneeksi katsominen (sääntöjen 8 § 2 mom.) — jäsenmaksu maksamatta" : "";
  }

  async function confirmIndividualAction() {
    if (!individualAction) return;

    const { type, memberId } = individualAction;
    const reason = individualReason || undefined;

    individualActionLoading = true;
    try {
      switch (type) {
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
  const canApprove = $derived(statusCounts.awaitingApproval + statusCounts.awaitingPayment > 0);
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
          variant={selectedStatus === "resigned" ? "default" : "outline"}
          size="sm"
          onclick={() => (selectedStatus = "resigned")}
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

  <!-- Bulk Action Toolbar -->
  {#if selectedCount > 0}
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
              count: statusCounts.awaitingApproval + statusCounts.awaitingPayment,
            })}
          </Button>
        {/if}
        {#if canDeemResigned}
          <Button
            size="sm"
            variant="outline"
            onclick={() => {
              deemResignedReason = "Eronneeksi katsominen (sääntöjen 8 § 2 mom.) — jäsenmaksu maksamatta";
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
                      <FlexRender content={header.column.columnDef.header} context={header.getContext()} />
                      <ArrowUpDown class="ml-2 size-4" />
                    </Button>
                  {:else}
                    <FlexRender content={header.column.columnDef.header} context={header.getContext()} />
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => {
                      const userId = row.original.userId;
                      if (expandedRows.has(userId)) {
                        const newSet = new Set(expandedRows);
                        newSet.delete(userId);
                        expandedRows = newSet;
                      } else {
                        expandedRows = new Set([...expandedRows, userId]);
                      }
                    }}
                  >
                    {#if expandedRows.has(row.original.userId)}
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
                  {@const filteredMemberships = getFilteredMemberships(row.original.allMemberships)}
                  <div class="flex items-center gap-2">
                    <span>{getLocalizedTypeName(row.original.membershipTypeName)}</span>
                    {#if filteredMemberships.length > 1}
                      <Badge variant="secondary" class="text-xs">
                        {$LL.admin.members.table.membershipsCount({ count: filteredMemberships.length })}
                      </Badge>
                    {/if}
                  </div>
                {:else}
                  <FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
                {/if}
              </Table.Cell>
            {/each}
          </Table.Row>
          {#if expandedRows.has(row.original.userId)}
            {@const filteredMemberships = getFilteredMemberships(row.original.allMemberships)}
            <Table.Row class="bg-muted/50">
              <Table.Cell colspan={columns.length}>
                <div class="p-4">
                  <!-- User Details -->
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
                          {row.original.isAllowedEmails ? $LL.admin.members.table.yes() : $LL.admin.members.table.no()}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <!-- Filtered Memberships -->
                  <div class="space-y-3">
                    <h4 class="font-semibold">
                      {#if filteredMemberships.length !== row.original.membershipCount}
                        {$LL.admin.members.table.memberships()} ({$LL.admin.members.table.membershipsOf({
                          filtered: filteredMemberships.length,
                          total: row.original.membershipCount,
                        })})
                      {:else}
                        {$LL.admin.members.table.memberships()} ({filteredMemberships.length})
                      {/if}
                    </h4>
                    <div class="space-y-3">
                      {#each filteredMemberships as membership (membership.id)}
                        {@const memberName = formatMemberName(row.original)}
                        <div class="rounded-md border p-4">
                          <div class="mb-3 grid gap-2 text-sm md:grid-cols-3">
                            <div>
                              <dt class="text-muted-foreground">{$LL.admin.members.table.typeLabel()}</dt>
                              <dd class="font-medium">{getLocalizedTypeName(membership.membershipTypeName)}</dd>
                            </div>
                            <div>
                              <dt class="text-muted-foreground">{$LL.admin.members.table.periodLabel()}</dt>
                              <dd>
                                {membership.membershipStartTime?.toLocaleDateString() ?? "-"} - {membership.membershipEndTime?.toLocaleDateString() ??
                                  "-"}
                              </dd>
                            </div>
                            <div>
                              <dt class="text-muted-foreground">{$LL.admin.members.table.priceLabel()}</dt>
                              <dd class="font-mono text-xs">
                                {membership.membershipStripePriceId ?? "-"}
                              </dd>
                            </div>
                            <div>
                              <dt class="text-muted-foreground">{$LL.admin.members.table.statusLabel()}</dt>
                              <dd>
                                <Badge variant={getStatusColor(membership.status)}>
                                  {formatStatus(membership.status)}
                                </Badge>
                              </dd>
                            </div>
                            <div>
                              <dt class="text-muted-foreground">{$LL.admin.members.table.createdLabel()}</dt>
                              <dd>{membership.createdAt.toLocaleDateString()}</dd>
                            </div>
                            {#if membership.stripeSessionId}
                              <div>
                                <dt class="text-muted-foreground">{$LL.admin.members.table.stripeSessionLabel()}</dt>
                                <dd class="font-mono text-xs">{membership.stripeSessionId}</dd>
                              </div>
                            {/if}
                            {#if membership.description}
                              <div class="md:col-span-3">
                                <dt class="text-muted-foreground">{$LL.admin.members.table.descriptionLabel()}</dt>
                                <dd class="whitespace-pre-wrap">{membership.description}</dd>
                              </div>
                            {/if}
                          </div>

                          <!-- Admin Actions per membership -->
                          {#if membership.status === "awaiting_approval"}
                            <div class="flex gap-2 border-t pt-3">
                              <form {...approveMember.for(membership.id).preflight(memberIdSchema)}>
                                <input
                                  {...approveMember.for(membership.id).fields.memberId.as("hidden", membership.id)}
                                />
                                <Button type="submit" size="sm" variant="default"
                                  >{$LL.admin.members.table.approve()}</Button
                                >
                              </form>
                              <Button
                                size="sm"
                                variant="destructive"
                                onclick={() => openIndividualAction("reject", membership.id, memberName)}
                              >
                                {$LL.admin.members.table.reject()}
                              </Button>
                            </div>
                          {:else if membership.status === "resigned" || membership.status === "rejected"}
                            <div class="flex gap-2 border-t pt-3">
                              <Button
                                size="sm"
                                variant="default"
                                onclick={() => openIndividualAction("reactivate", membership.id, memberName)}
                              >
                                {$LL.admin.members.table.reactivate()}
                              </Button>
                            </div>
                          {:else if membership.status === "awaiting_payment"}
                            <div class="flex gap-2 border-t pt-3">
                              <form {...approveMember.for(membership.id).preflight(memberIdSchema)}>
                                <input
                                  {...approveMember.for(membership.id).fields.memberId.as("hidden", membership.id)}
                                />
                                <Button type="submit" size="sm" variant="default"
                                  >{$LL.admin.members.table.approve()}</Button
                                >
                              </form>
                              <Button
                                size="sm"
                                variant="destructive"
                                onclick={() => openIndividualAction("reject", membership.id, memberName)}
                              >
                                {$LL.admin.members.table.reject()}
                              </Button>
                            </div>
                          {:else if membership.status === "active"}
                            <div class="flex gap-2 border-t pt-3">
                              <Button
                                size="sm"
                                variant="outline"
                                onclick={() => openIndividualAction("deemResigned", membership.id, memberName)}
                              >
                                {$LL.admin.members.table.deemResigned()}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onclick={() => openIndividualAction("resign", membership.id, memberName)}
                              >
                                {$LL.admin.members.table.resignMembership()}
                              </Button>
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
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
        current: table.getRowModel().rows.length,
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
          count: statusCounts.awaitingApproval + statusCounts.awaitingPayment,
        })}
      </AlertDialog.Title>
      <AlertDialog.Description>
        {$LL.admin.members.table.confirmApproveDescription()}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <ul class="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
      {#each getSelectedMemberNames() as name, i (i)}
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
          {#if individualAction.type === "deemResigned"}
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
          {#if individualAction.type === "deemResigned"}
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
      <div class="space-y-2">
        <label for="individual-reason" class="text-sm font-medium">
          {$LL.admin.members.table.reasonLabel()}
        </label>
        <Input id="individual-reason" bind:value={individualReason} class="text-sm" />
      </div>
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
