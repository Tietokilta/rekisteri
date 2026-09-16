<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import * as NativeSelect from "$lib/components/ui/native-select";
  import { Badge } from "$lib/components/ui/badge";
  import Download from "@lucide/svelte/icons/download";
  import { toast } from "svelte-sonner";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import {
    generateMembersCSV,
    downloadFile,
    createExportContext,
    DEFAULT_EXPORT_COLUMNS,
    ALL_EXPORT_COLUMNS,
    type ExportColumnKey,
    type ExportableMember,
  } from "$lib/utils/export";
  import { logMemberExport } from "./data.remote";
  import type { LocalizedString, MembershipType } from "$lib/server/db/schema";
  import { MEMBER_STATUS_VALUES } from "$lib/shared/enums";

  type Props = {
    open: boolean;
    allMembers: ExportableMember[];
    selectedMembers: ExportableMember[];
    membershipTypes: MembershipType[];
    years: number[];
    currentYearFilter: string;
    currentTypeFilter: string;
    currentStatusFilter: string;
  };

  let {
    open = $bindable(false),
    allMembers,
    selectedMembers,
    membershipTypes,
    years,
    currentYearFilter,
    currentTypeFilter,
    currentStatusFilter,
  }: Props = $props();

  // State inside dialog
  let targetScope = $state<"filtered" | "selected">("filtered");
  let selectedYear = $state(untrack(() => currentYearFilter));
  let selectedType = $state(untrack(() => currentTypeFilter));
  let selectedStatus = $state(untrack(() => currentStatusFilter));
  let emailAllowedOnly = $state(false);
  const selectedColumns = new SvelteSet<ExportColumnKey>(DEFAULT_EXPORT_COLUMNS);
  let isExporting = $state(false);

  // Sync with prop changes when opened
  $effect(() => {
    if (!open) return;
    targetScope = selectedMembers.length > 0 ? "selected" : "filtered";
    selectedYear = currentYearFilter;
    selectedType = currentTypeFilter;
    selectedStatus = currentStatusFilter;
    emailAllowedOnly = false;
  });

  // Helper to get localized membership type name
  function getLocalizedTypeName(name: LocalizedString | null): string {
    if (!name) return "-";
    return $locale === "fi" ? name.fi : name.en;
  }

  // Canonical export context derived from i18n and current locale
  const exportContext = $derived(createExportContext($LL, $locale));

  // Calculate matching members based on dialog filters
  const candidateMembers = $derived.by(() => {
    const base = targetScope === "selected" ? selectedMembers : allMembers;
    return base.filter((member) => {
      if (selectedYear !== "all") {
        const memberYear = member.membershipStartTime?.getFullYear().toString();
        if (memberYear !== selectedYear) return false;
      }
      if (selectedType !== "all" && member.membershipTypeId !== selectedType) {
        return false;
      }
      if (selectedStatus !== "all" && member.status !== selectedStatus) {
        return false;
      }
      if (emailAllowedOnly && member.isAllowedEmails !== true) {
        return false;
      }
      return true;
    });
  });

  function toggleColumn(col: ExportColumnKey) {
    if (selectedColumns.has(col)) {
      if (selectedColumns.size > 1) {
        selectedColumns.delete(col);
      }
    } else {
      selectedColumns.add(col);
    }
  }

  function selectAllColumns() {
    for (const col of ALL_EXPORT_COLUMNS) {
      selectedColumns.add(col);
    }
  }

  function resetColumns() {
    selectedColumns.clear();
    for (const col of DEFAULT_EXPORT_COLUMNS) {
      selectedColumns.add(col);
    }
  }

  async function handleExport() {
    if (candidateMembers.length === 0) return;
    isExporting = true;

    try {
      const activeColumns = ALL_EXPORT_COLUMNS.filter((col) => selectedColumns.has(col));
      const csvContent = generateMembersCSV(candidateMembers, activeColumns, exportContext);

      const timestamp = new Date().toISOString().split("T", 1)[0];
      const filename = `rekisteri-jasenet-${timestamp}.csv`;

      downloadFile(csvContent, filename);

      const filterSummary = `scope=${targetScope}, year=${selectedYear}, type=${selectedType}, status=${selectedStatus}, emailAllowed=${emailAllowedOnly}`;
      void logMemberExport({
        count: candidateMembers.length,
        filterSummary,
      });

      toast.success($LL.admin.members.table.exported());
      open = false;
    } catch (err) {
      console.error("Export error:", err);
      toast.error($LL.error.serverError());
    } finally {
      isExporting = false;
    }
  }
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content class="max-h-[90vh] max-w-2xl overflow-y-auto">
    <AlertDialog.Header>
      <AlertDialog.Title>{$LL.admin.members.table.exportDialog.title()}</AlertDialog.Title>
      <AlertDialog.Description>{$LL.admin.members.table.exportDialog.description()}</AlertDialog.Description>
    </AlertDialog.Header>

    <div class="space-y-4 py-2">
      <!-- Target Scope (if selected rows exist) -->
      {#if selectedMembers.length > 0}
        <div class="space-y-1.5">
          <Label>{$LL.admin.members.table.exportDialog.targetScope()}</Label>
          <div class="flex gap-4">
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" bind:group={targetScope} value="filtered" />
              {$LL.admin.members.table.exportDialog.allFiltered({ count: allMembers.length })}
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" bind:group={targetScope} value="selected" />
              {$LL.admin.members.table.exportDialog.selectedOnly({ count: selectedMembers.length })}
            </label>
          </div>
        </div>
      {/if}

      <!-- Filters Grid -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <!-- Year -->
        <div class="space-y-1">
          <Label for="export-year">{$LL.admin.members.table.filterYear()}</Label>
          <NativeSelect.Root id="export-year" bind:value={selectedYear}>
            <NativeSelect.Option value="all">{$LL.admin.members.table.all()}</NativeSelect.Option>
            {#each years as year (year)}
              <NativeSelect.Option value={year.toString()}>{year}</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
        </div>

        <!-- Membership Type -->
        <div class="space-y-1">
          <Label for="export-type">{$LL.admin.members.table.filterType()}</Label>
          <NativeSelect.Root id="export-type" bind:value={selectedType}>
            <NativeSelect.Option value="all">{$LL.admin.members.table.all()}</NativeSelect.Option>
            {#each membershipTypes as type (type.id)}
              <NativeSelect.Option value={type.id}>{getLocalizedTypeName(type.name)}</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
        </div>

        <!-- Status -->
        <div class="space-y-1">
          <Label for="export-status">{$LL.admin.members.table.filterStatus()}</Label>
          <NativeSelect.Root id="export-status" bind:value={selectedStatus}>
            <NativeSelect.Option value="all">{$LL.admin.members.table.all()}</NativeSelect.Option>
            {#each MEMBER_STATUS_VALUES as status (status)}
              <NativeSelect.Option value={status}>{exportContext.statusLabels[status]}</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
        </div>
      </div>

      <!-- Email allowed checkbox -->
      <div class="flex items-center space-x-2 pt-1">
        <Checkbox id="export-email-allowed" bind:checked={emailAllowedOnly} />
        <Label for="export-email-allowed" class="cursor-pointer text-sm font-normal">
          {$LL.admin.members.table.exportDialog.filterEmailAllowed()}
        </Label>
      </div>

      <!-- Empty state hint when no members match filters -->
      {#if candidateMembers.length === 0}
        <div
          class="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
        >
          {$LL.admin.members.table.exportDialog.noMatchingMembers()}
        </div>
      {/if}

      <!-- Column Selector -->
      <div class="space-y-2 border-t pt-3">
        <div class="flex items-center justify-between">
          <Label class="font-medium">{$LL.admin.members.table.exportDialog.columnsTitle()}</Label>
          <div class="flex gap-2 text-xs">
            <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={selectAllColumns}>
              {$LL.admin.members.table.exportDialog.selectAllColumns()}
            </Button>
            <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={resetColumns}>
              {$LL.admin.members.table.exportDialog.resetColumns()}
            </Button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {#each ALL_EXPORT_COLUMNS as col (col)}
            {@const isChecked = selectedColumns.has(col)}
            <label class="flex cursor-pointer items-center space-x-2 rounded p-1 hover:bg-muted/50">
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => toggleColumn(col)}
                disabled={isChecked && selectedColumns.size === 1}
              />
              <span class="text-xs">{exportContext.columnLabels[col]}</span>
            </label>
          {/each}
        </div>
      </div>
    </div>

    <AlertDialog.Footer class="flex items-center sm:justify-between">
      <div class="text-sm text-muted-foreground">
        <Badge variant="secondary">
          {$LL.admin.members.table.exportDialog.exportSummary({ count: candidateMembers.length })}
        </Badge>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" onclick={() => (open = false)}>
          {$LL.admin.members.table.exportDialog.cancel()}
        </Button>
        <Button variant="default" onclick={handleExport} disabled={candidateMembers.length === 0 || isExporting}>
          <Download class="mr-2 size-4" />
          {$LL.admin.members.table.exportDialog.downloadCsv()}
        </Button>
      </div>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
