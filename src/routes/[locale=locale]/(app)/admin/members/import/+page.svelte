<script module lang="ts">
  import type { CsvRow } from "./schema";

  // Module-level state that persists across component re-mounts.
  // SvelteKit's command() auto-invalidation can re-mount the component,
  // losing all instance $state. This persisted state preserves the full
  // analysis result so re-mounts restore the correct UI (e.g. "Luotu!" badges).
  type MembershipActionStatus = "creating" | "created" | "error";

  type UnmatchedMembership = {
    key: string;
    membershipTypeId: string;
    startDate: string;
    inferredEndDate: string;
    rowCount: number;
    linkedMembershipId?: string;
    status: "pending" | MembershipActionStatus;
  };

  type AnalyzedRow = CsvRow & {
    rowIndex: number;
    matchedMembershipId?: string;
  };

  type PersistedState = {
    validRows: CsvRow[];
    validationErrors: Array<{ row: number; message: string; code?: string }>;
    matchedRows: AnalyzedRow[];
    unmatchedRows: AnalyzedRow[];
    unmatchedMemberships: UnmatchedMembership[];
  };

  let persistedFileName = "";
  let persistedState: PersistedState | null = null;
</script>

<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import Papa from "papaparse";
  import { importMembers, createLegacyMembership, createLegacyMemberships } from "./data.remote";
  import { csvRowSchema, importMembersSchema } from "./schema";
  import type { PageData } from "./$types";
  import { untrack } from "svelte";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import * as v from "valibot";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";

  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import CircleDashed from "@lucide/svelte/icons/circle-dashed";
  import Plus from "@lucide/svelte/icons/plus";

  let { data }: { data: PageData } = $props();

  let files = $state<FileList>();
  let csvFile = $derived(files?.item(0));
  let isImporting = $state(false);

  // Parsed and validated rows
  let validRows = $state<CsvRow[]>([]);
  let validationErrors = $state<Array<{ row: number; message: string; code?: string }>>([]);

  let matchedRows = $state<AnalyzedRow[]>([]);
  let unmatchedRows = $state<AnalyzedRow[]>([]);
  let unmatchedMemberships = $state<UnmatchedMembership[]>([]);

  const expectedColumns = [
    "firstNames",
    "lastName",
    "homeMunicipality",
    "email",
    "membershipTypeId",
    "membershipStartDate",
  ] as const;

  // Helper to get localized membership type name
  function getTypeName(membershipTypeId: string) {
    const membershipType = data.membershipTypes.find((t) => t.id === membershipTypeId);
    if (!membershipType) return membershipTypeId;
    return $locale === "fi" ? membershipType.name.fi : membershipType.name.en;
  }

  // Helper to infer end date from start date (Aug 1 -> Jul 31 next year)
  function inferEndDate(startDateStr: string): string {
    const startDate = new Date(startDateStr);
    // If start is Aug 1, end is Jul 31 next year
    // Otherwise, end is one year later minus one day
    const startMonth = startDate.getMonth();
    const startDay = startDate.getDate();

    if (startMonth === 7 && startDay === 1) {
      // August 1 -> July 31 next year
      return `${startDate.getFullYear() + 1}-07-31`;
    }
    // Default: one year later minus one day
    const endYear = startDate.getFullYear() + 1;
    const endMonth = startMonth;
    const endDay = startDay - 1;
    // When startDay is 1, endDay becomes 0. Date constructor normalizes this
    // to the last day of the previous month (e.g., March 0 -> Feb 28/29).
    const endDate = new Date(endYear, endMonth, endDay);
    return endDate.toISOString().split("T")[0] ?? "";
  }

  // Helper to find membership by typeId and start date
  function findMembership(membershipTypeId: string, startDateStr: string) {
    const startDate = new Date(startDateStr);
    return data.memberships.find(
      (m) => m.membershipTypeId === membershipTypeId && m.startTime.getTime() === startDate.getTime(),
    );
  }

  // Analyze rows against available memberships and categorize them.
  function analyzeRows(rows: CsvRow[], memberships: typeof data.memberships) {
    const matched: AnalyzedRow[] = [];
    const unmatched: AnalyzedRow[] = [];
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- intentionally non-reactive to prevent infinite loops
    const unmatchedKeys = new Map<string, UnmatchedMembership>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const startDate = new Date(row.membershipStartDate);
      const membership = memberships.find(
        (m) => m.membershipTypeId === row.membershipTypeId && m.startTime.getTime() === startDate.getTime(),
      );

      if (membership) {
        matched.push({ ...row, rowIndex: i, matchedMembershipId: membership.id });
      } else {
        unmatched.push({ ...row, rowIndex: i });

        const key = `${row.membershipTypeId}|${row.membershipStartDate}`;
        const existing = unmatchedKeys.get(key);
        if (existing) {
          existing.rowCount++;
        } else {
          unmatchedKeys.set(key, {
            key,
            membershipTypeId: row.membershipTypeId,
            startDate: row.membershipStartDate,
            inferredEndDate: inferEndDate(row.membershipStartDate),
            rowCount: 1,
            status: "pending",
          });
        }
      }
    }

    return {
      matched,
      unmatched,
      unmatchedMemberships: Array.from(unmatchedKeys.values()).toSorted((a, b) =>
        b.startDate.localeCompare(a.startDate),
      ),
    };
  }

  // Persist current analysis state to module-level storage so it survives
  // component re-mounts caused by SvelteKit's command() auto-invalidation.
  function persistCurrentState(): void {
    persistedState = {
      validRows,
      validationErrors,
      matchedRows,
      unmatchedRows,
      unmatchedMemberships,
    };
  }

  // Restore persisted state into instance $state variables.
  function restorePersistedState(): void {
    if (!persistedState) return;
    validRows = persistedState.validRows;
    validationErrors = persistedState.validationErrors;
    matchedRows = persistedState.matchedRows;
    unmatchedRows = persistedState.unmatchedRows;
    unmatchedMemberships = persistedState.unmatchedMemberships;
  }

  // Parse and analyze CSV when file changes.
  // When the component re-mounts with the same file (after command() invalidation),
  // restores persisted state instead of re-parsing to preserve user actions like
  // "Luotu!" badges that would otherwise be lost.
  $effect(() => {
    const file = csvFile;

    // Reset instance state
    validRows = [];
    validationErrors = [];
    matchedRows = [];
    unmatchedRows = [];
    unmatchedMemberships = [];

    if (!file || file.type !== "text/csv") return;

    // On re-mount with same file, restore persisted state instead of re-parsing.
    // This preserves user actions (created/linked memberships) across re-mounts.
    if (file.name === persistedFileName && persistedState) {
      restorePersistedState();
      return;
    }

    // New file selected -- clear persisted state and parse fresh
    persistedFileName = file.name;
    persistedState = null;

    // Capture current memberships snapshot to avoid reactive reads in async callback
    const membershipsSnapshot = untrack(() => data.memberships);
    const typeIdsSnapshot = untrack(() => data.typeIds);

    const readFile = async () => {
      const csvString = (await file.text()).trim();
      const csv = Papa.parse(csvString, { header: true });

      // Validate columns
      const hasCorrectColumns =
        csv.meta.fields?.length === expectedColumns.length &&
        csv.meta.fields.every((field, i) => field === expectedColumns[i]);

      if (!hasCorrectColumns) {
        validationErrors = [
          {
            row: 0,
            message: $LL.admin.import.csvColumnsMismatch({ columns: expectedColumns.join(", ") }),
            code: "csv_columns_mismatch",
          },
        ];
        return;
      }

      // Validate each row
      const validated: CsvRow[] = [];
      const errors: Array<{ row: number; message: string; code?: string }> = [];

      for (let i = 0; i < csv.data.length; i++) {
        const rowData = csv.data[i];
        const validation = v.safeParse(csvRowSchema, rowData);

        if (validation.success) {
          validated.push(validation.output);
        } else {
          const errorMessages = validation.issues
            .map((issue) => `${issue.path?.map((p) => p.key).join(".") || "field"}: ${issue.message}`)
            .join(", ");
          errors.push({ row: i + 1, message: errorMessages });
        }
      }

      validRows = validated;
      validationErrors = errors;

      // Validate membership type IDs
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local variable in async callback, not state
      const invalidTypes = new Set<string>();
      for (const row of validated) {
        if (!typeIdsSnapshot.includes(row.membershipTypeId)) {
          invalidTypes.add(row.membershipTypeId);
        }
      }

      if (invalidTypes.size > 0) {
        validationErrors = [
          ...validationErrors,
          {
            row: 0,
            message: $LL.admin.import.invalidTypeIdsError({
              invalidTypes: Array.from(invalidTypes).join(", "),
              availableIds: typeIdsSnapshot.join(", "),
            }),
            code: "invalid_type_ids",
          },
        ];
      }

      // Analyze rows (even if there are type ID errors, to show helpful info)
      const analysis = analyzeRows(validated, membershipsSnapshot);
      matchedRows = analysis.matched;
      unmatchedRows = analysis.unmatched;
      unmatchedMemberships = analysis.unmatchedMemberships;
    };

    void readFile();
  });

  // Check if all unmatched are resolved (either created or linked)
  const allResolved = $derived(unmatchedMemberships.every((m) => m.status === "created" || m.linkedMembershipId));

  // Check if all type IDs are valid
  const hasInvalidTypeIds = $derived(validationErrors.some((e) => e.code === "invalid_type_ids"));

  // Can import when: has valid rows, no validation errors (except fixable type errors), and all unmatched resolved
  const canImport = $derived(
    validRows.length > 0 &&
      validationErrors.filter((e) => e.row !== 0).length === 0 &&
      !hasInvalidTypeIds &&
      (unmatchedRows.length === 0 || allResolved) &&
      !isImporting,
  );

  // Helper to update a single membership status immutably
  function updateMembershipStatus(key: string, status: UnmatchedMembership["status"]) {
    unmatchedMemberships = unmatchedMemberships.map((m) => (m.key === key ? { ...m, status } : m));
  }

  // Create a single legacy membership
  async function handleQuickCreate(membership: UnmatchedMembership) {
    updateMembershipStatus(membership.key, "creating");
    persistCurrentState();

    try {
      const result = await createLegacyMembership({
        membershipTypeId: membership.membershipTypeId,
        startTime: membership.startDate,
        endTime: membership.inferredEndDate,
      });

      const status = result?.success ? "created" : "error";
      updateMembershipStatus(membership.key, status);
    } catch {
      updateMembershipStatus(membership.key, "error");
    }

    persistCurrentState();
  }

  // Create all missing memberships at once
  let isCreatingAll = $state(false);

  async function handleCreateAllMissing() {
    const toCreate = unmatchedMemberships.filter((m) => m.status === "pending" && !m.linkedMembershipId);
    if (toCreate.length === 0) return;

    isCreatingAll = true;

    const keysToCreate = new Set(toCreate.map((m) => m.key));
    unmatchedMemberships = unmatchedMemberships.map((m) =>
      keysToCreate.has(m.key) ? { ...m, status: "creating" as const } : m,
    );
    persistCurrentState();

    const membershipsData = toCreate.map((m) => ({
      membershipTypeId: m.membershipTypeId,
      startTime: m.startDate,
      endTime: m.inferredEndDate,
    }));

    try {
      const result = await createLegacyMemberships({ memberships: membershipsData });

      const newStatus = result?.success ? ("created" as const) : ("error" as const);
      unmatchedMemberships = unmatchedMemberships.map((m) =>
        keysToCreate.has(m.key) ? { ...m, status: newStatus } : m,
      );
    } catch {
      unmatchedMemberships = unmatchedMemberships.map((m) =>
        keysToCreate.has(m.key) ? { ...m, status: "error" as const } : m,
      );
    }

    persistCurrentState();
    isCreatingAll = false;
  }

  // Link to existing membership
  function handleLinkToExisting(membership: UnmatchedMembership, membershipId: string) {
    unmatchedMemberships = unmatchedMemberships.map((m) =>
      m.key === membership.key ? { ...m, linkedMembershipId: membershipId || undefined } : m,
    );
    persistCurrentState();
  }

  // Calculate import preview (for matched + linked rows)
  const importPreview = $derived.by(() => {
    if (validRows.length === 0) return null;

    // Get rows that will be imported (matched + those linked to existing)
    const linkedKeys = new Set(unmatchedMemberships.filter((m) => m.linkedMembershipId).map((m) => m.key));
    const createdKeys = new Set(unmatchedMemberships.filter((m) => m.status === "created").map((m) => m.key));

    const importableRows = validRows.filter((row) => {
      const membership = findMembership(row.membershipTypeId, row.membershipStartDate);
      if (membership) return true;

      const key = `${row.membershipTypeId}|${row.membershipStartDate}`;
      return linkedKeys.has(key) || createdKeys.has(key);
    });

    const uniqueEmails = new Set(importableRows.map((r) => r.email));
    const memberRecords = importableRows.length;

    // Calculate active vs expired
    let activeCount = 0;
    let expiredCount = 0;
    const now = new Date();

    for (const row of importableRows) {
      let membership = findMembership(row.membershipTypeId, row.membershipStartDate);
      if (!membership) {
        // Check if linked
        const key = `${row.membershipTypeId}|${row.membershipStartDate}`;
        const linked = unmatchedMemberships.find((m) => m.key === key);
        if (linked?.linkedMembershipId) {
          membership = data.memberships.find((m) => m.id === linked.linkedMembershipId);
        }
      }
      if (membership) {
        if (membership.endTime < now) {
          expiredCount++;
        } else {
          activeCount++;
        }
      }
    }

    return {
      userCount: uniqueEmails.size,
      memberRecords,
      activeCount,
      expiredCount,
    };
  });

  // Prepare rows for import (applying links)
  function getRowsForImport(): CsvRow[] {
    return validRows.map((row) => {
      const key = `${row.membershipTypeId}|${row.membershipStartDate}`;
      const unmatched = unmatchedMemberships.find((m) => m.key === key);

      if (unmatched?.linkedMembershipId) {
        // Find the linked membership and use its typeId/startDate
        const linked = data.memberships.find((m) => m.id === unmatched.linkedMembershipId);
        if (linked) {
          return {
            ...row,
            membershipTypeId: linked.membershipTypeId,
            membershipStartDate: linked.startTime.toISOString().split("T")[0] ?? "",
          };
        }
      }
      return row;
    });
  }

  // Group memberships by type for dropdown, with matching type first
  function groupedMembershipsForRow(membershipTypeId: string) {
    // Group by type
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local variable in function, not state
    const groups = new Map<string, { typeId: string; typeName: string; memberships: typeof data.memberships }>();

    for (const m of data.memberships) {
      const existing = groups.get(m.membershipTypeId);
      if (existing) {
        existing.memberships.push(m);
      } else {
        groups.set(m.membershipTypeId, {
          typeId: m.membershipTypeId,
          typeName: getTypeName(m.membershipTypeId),
          memberships: [m],
        });
      }
    }

    // Sort memberships within each group by date (newest first)
    for (const group of groups.values()) {
      group.memberships.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }

    // Convert to array and sort: matching type first, then alphabetically by type name
    return Array.from(groups.values()).toSorted((a, b) => {
      const aMatch = a.typeId === membershipTypeId ? 0 : 1;
      const bMatch = b.typeId === membershipTypeId ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.typeName.localeCompare(b.typeName);
    });
  }
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
  <AdminPageHeader title={$LL.admin.import.title()} />

  <div class="flex w-full flex-col gap-8 lg:flex-row">
    <!-- Upload Section -->
    <div class="w-full lg:w-80">
      <div class="rounded-lg border p-6">
        <h2 class="mb-4 text-lg font-medium">{$LL.admin.import.step1()}</h2>
        <Label for="csv-input" class="mb-2">{$LL.admin.import.csvFile()}</Label>
        <Input id="csv-input" type="file" accept="text/csv,.csv" bind:files class="mb-4" />

        <div class="rounded-md bg-muted p-4 text-sm">
          <p class="mb-2 font-medium">{$LL.admin.import.expectedColumns()}</p>
          <ul class="list-inside list-disc space-y-1 text-muted-foreground">
            {#each expectedColumns as column (column)}
              <li><code class="rounded bg-background px-1">{column}</code></li>
            {/each}
          </ul>
        </div>

        <div class="mt-4">
          <p class="text-xs text-muted-foreground">
            {$LL.admin.import.matchNote()}
          </p>
          <p class="mt-2 text-xs font-medium text-muted-foreground">{$LL.admin.import.availableTypeIds()}</p>
          <ul class="space-y-1 text-xs text-muted-foreground">
            {#each data.membershipTypes as membershipType (membershipType.id)}
              <li>
                <code class="rounded bg-background px-1">{membershipType.id}</code>
                <span class="text-muted-foreground/70">
                  ({$locale === "fi" ? membershipType.name.fi : membershipType.name.en})
                </span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>

    <!-- Analysis & Resolution Section -->
    <div class="flex-1">
      {#if !csvFile}
        <div class="rounded-lg border p-6">
          <p class="text-sm text-muted-foreground">{$LL.admin.import.uploadPrompt()}</p>
        </div>
      {:else if validationErrors.length > 0 && validRows.length === 0}
        <div class="rounded-lg border border-destructive p-6">
          <h2 class="mb-4 text-lg font-medium text-destructive">{$LL.admin.import.validationErrors()}</h2>
          <ul class="list-inside list-disc space-y-1 text-sm text-destructive">
            {#each validationErrors as error, i (i)}
              <li data-testid="validation-error">
                {$LL.admin.import.rowError({ row: error.row, message: error.message })}
              </li>
            {/each}
          </ul>
        </div>
      {:else}
        <!-- Analysis Summary -->
        <div class="mb-6 rounded-lg border p-6">
          <h2 class="mb-4 text-lg font-medium">{$LL.admin.import.step2()}</h2>

          <div class="grid gap-3 sm:grid-cols-3">
            <!-- Matched -->
            <div
              class="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950"
            >
              <CircleCheck class="size-5 text-green-600" />
              <div>
                <p class="font-medium text-green-700 dark:text-green-300">{$LL.admin.import.matched()}</p>
                <p class="text-sm text-green-600 dark:text-green-400">
                  {$LL.admin.import.matchedDesc({ count: matchedRows.length })}
                </p>
              </div>
            </div>

            <!-- Unmatched -->
            {#if unmatchedRows.length > 0}
              <div
                class="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950"
              >
                <CircleDashed class="size-5 text-orange-600" />
                <div>
                  <p class="font-medium text-orange-700 dark:text-orange-300">{$LL.admin.import.unmatched()}</p>
                  <p class="text-sm text-orange-600 dark:text-orange-400">
                    {$LL.admin.import.unmatchedDesc({ count: unmatchedRows.length })}
                  </p>
                </div>
              </div>
            {/if}

            <!-- Errors -->
            {#if validationErrors.length > 0}
              <div class="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <CircleAlert class="size-5 text-destructive" />
                <div>
                  <p class="font-medium text-destructive">{$LL.admin.import.errors()}</p>
                  <p class="text-sm text-destructive/80">
                    {$LL.admin.import.errorsDesc({ count: validationErrors.length })}
                  </p>
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Unmatched Resolution Section -->
        {#if unmatchedMemberships.length > 0}
          <div class="mb-6 rounded-lg border border-orange-200 p-6 dark:border-orange-900">
            <div class="mb-4 flex items-center justify-between">
              <div>
                <h3 class="font-medium">{$LL.admin.import.unmatchedMemberships()}</h3>
                <p class="text-sm text-muted-foreground">{$LL.admin.import.unmatchedMembershipsDesc()}</p>
              </div>
              {#if unmatchedMemberships.filter((m) => m.status === "pending" && !m.linkedMembershipId).length > 1}
                <Button variant="outline" size="sm" onclick={handleCreateAllMissing} disabled={isCreatingAll}>
                  <Plus class="mr-1 size-4" />
                  {isCreatingAll ? $LL.admin.import.creating() : $LL.admin.import.createAllMissing()}
                </Button>
              {/if}
            </div>

            <div class="space-y-3">
              {#each unmatchedMemberships as membership (membership.key)}
                <div
                  class="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3"
                  data-testid="unmatched-membership"
                >
                  <div class="min-w-48 flex-1">
                    <p class="font-medium" data-testid="membership-type-name">
                      {getTypeName(membership.membershipTypeId)}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      ID: <code>{membership.membershipTypeId}</code>
                    </p>
                    <p class="text-sm text-muted-foreground">
                      {$LL.admin.import.start()} <code data-testid="membership-start-date">{membership.startDate}</code>
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {$LL.admin.import.rowsAffected({ count: membership.rowCount })}
                    </p>
                  </div>

                  {#if membership.status === "created"}
                    <Badge variant="default" class="bg-green-600" data-testid="badge-created">
                      <CircleCheck class="mr-1 size-3" />
                      {$LL.admin.import.created()}
                    </Badge>
                  {:else if membership.status === "creating"}
                    <Badge variant="secondary" data-testid="badge-creating">
                      {$LL.admin.import.creating()}
                    </Badge>
                  {:else if membership.status === "error"}
                    <Badge variant="destructive" data-testid="badge-error">
                      <CircleAlert class="mr-1 size-3" />
                      {$LL.admin.import.createFailed()}
                    </Badge>
                  {:else if membership.linkedMembershipId}
                    <Badge variant="secondary" data-testid="badge-linked">
                      <CircleCheck class="mr-1 size-3" />
                      {$LL.admin.import.linked()}
                    </Badge>
                  {:else}
                    <div class="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onclick={() => handleQuickCreate(membership)}>
                        <Plus class="mr-1 size-4" />
                        {$LL.admin.import.quickCreate()}
                      </Button>

                      <span class="text-sm text-muted-foreground">{$LL.admin.import.or()}</span>

                      <NativeSelect.Root
                        class="w-56"
                        value={membership.linkedMembershipId ?? ""}
                        onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                          handleLinkToExisting(membership, e.currentTarget.value)}
                      >
                        <NativeSelect.Option value="">{$LL.admin.import.selectMembership()}</NativeSelect.Option>
                        {#each groupedMembershipsForRow(membership.membershipTypeId) as group (group.typeId)}
                          <NativeSelect.OptGroup label={group.typeName}>
                            {#each group.memberships as m (m.id)}
                              <NativeSelect.Option value={m.id}>
                                {m.startTime.toISOString().split("T")[0]} – {m.endTime.toISOString().split("T")[0]}
                              </NativeSelect.Option>
                            {/each}
                          </NativeSelect.OptGroup>
                        {/each}
                      </NativeSelect.Root>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Import Preview & Action -->
        {#if importMembers.result?.success}
          {@const successCount = importMembers.result.successCount ?? 0}
          {@const totalRows = importMembers.result.totalRows ?? 0}
          <div class="mb-4 rounded-md border border-green-600 bg-green-600/10 p-4">
            <p class="font-medium text-green-600">{$LL.admin.import.success()}</p>
            <p class="text-sm text-green-600">
              {$LL.admin.import.successCount({ successCount, totalRows })}
            </p>
            {#if importMembers.result.errors && importMembers.result.errors.length > 0}
              {@const errorCount = importMembers.result.errors.length}
              <details class="mt-2">
                <summary class="cursor-pointer text-sm text-green-600">
                  {$LL.admin.import.viewErrors({ errorCount })}
                </summary>
                <ul class="mt-2 list-inside list-disc space-y-1 text-sm">
                  {#each importMembers.result.errors as error, i (i)}
                    <li>
                      {$LL.admin.import.rowErrorDetail({ row: error.row, email: error.email, error: error.error })}
                    </li>
                  {/each}
                </ul>
              </details>
            {/if}
          </div>
        {:else if importMembers.result?.success === false}
          <div class="mb-4 rounded-md border border-destructive bg-destructive/10 p-4">
            <p class="font-medium text-destructive">{$LL.admin.import.failed()}</p>
          </div>
        {/if}

        {#if importPreview && importPreview.memberRecords > 0}
          <div class="rounded-lg border p-6">
            <h2 class="mb-4 text-lg font-medium">{$LL.admin.import.step3()}</h2>

            <div class="mb-4 rounded-md border bg-blue-600/10 p-4">
              <p class="mb-3 font-medium text-blue-600">{$LL.admin.import.preview()}</p>
              <div class="space-y-2 text-sm">
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">{$LL.admin.import.uniqueUsers()}</span>
                  <span class="font-medium">{importPreview.userCount}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">{$LL.admin.import.recordsToCreate()}</span>
                  <span class="font-medium">{importPreview.memberRecords}</span>
                </div>
                <div class="mt-3 border-t pt-2">
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">{$LL.admin.import.willBeActive()}</span>
                    <span class="font-medium text-green-600">{importPreview.activeCount}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">{$LL.admin.import.willBeExpired()}</span>
                    <span class="font-medium text-orange-600">{importPreview.expiredCount}</span>
                  </div>
                </div>
              </div>
              <p class="mt-3 text-xs text-muted-foreground">
                {$LL.admin.import.note()}
              </p>
            </div>

            {#if !canImport && unmatchedRows.length > 0 && !allResolved}
              <p class="mb-4 text-sm text-orange-600">
                {$LL.admin.import.resolveToImport()}
              </p>
            {/if}

            <form
              {...importMembers.preflight(importMembersSchema).enhance(async ({ submit }) => {
                isImporting = true;
                await submit();
                isImporting = false;
              })}
            >
              <input {...importMembers.fields.rows.as("hidden", JSON.stringify(getRowsForImport()))} />
              <Button type="submit" disabled={!canImport} class="w-full">
                {isImporting
                  ? $LL.admin.import.importing()
                  : $LL.admin.import.importButton({ count: importPreview.memberRecords })}
              </Button>
            </form>
          </div>
        {/if}

        <!-- Data Preview Table -->
        {#if validRows.length > 0}
          <div class="mt-6 rounded-lg border p-6">
            <h3 class="mb-4 text-sm font-medium">{$LL.admin.import.dataPreview()}</h3>
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-sm">
                <thead>
                  <tr class="border-b">
                    <th class="p-2 text-left font-medium">{$LL.admin.import.firstNames()}</th>
                    <th class="p-2 text-left font-medium">{$LL.admin.import.lastName()}</th>
                    <th class="p-2 text-left font-medium">{$LL.admin.import.municipality()}</th>
                    <th class="p-2 text-left font-medium">{$LL.admin.import.email()}</th>
                    <th class="p-2 text-left font-medium">{$LL.admin.import.membershipType()}</th>
                    <th class="p-2 text-left font-medium">{$LL.admin.import.startDate()}</th>
                    <th class="p-2 text-left font-medium">{$LL.admin.import.statusHeader()}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each validRows.slice(0, 10) as row, i (i)}
                    {@const isMatched = matchedRows.some((r) => r.rowIndex === i)}
                    {@const key = `${row.membershipTypeId}|${row.membershipStartDate}`}
                    {@const unmatchedEntry = unmatchedMemberships.find((m) => m.key === key)}
                    {@const isResolved = unmatchedEntry?.status === "created" || unmatchedEntry?.linkedMembershipId}
                    <tr class="border-b hover:bg-muted/50">
                      <td class="p-2">{row.firstNames}</td>
                      <td class="p-2">{row.lastName}</td>
                      <td class="p-2">{row.homeMunicipality}</td>
                      <td class="p-2">{row.email}</td>
                      <td class="p-2">{getTypeName(row.membershipTypeId)}</td>
                      <td class="p-2">{row.membershipStartDate}</td>
                      <td class="p-2">
                        {#if isMatched || isResolved}
                          <Badge variant="default" class="bg-green-600 text-xs">
                            <CircleCheck class="mr-1 size-3" />
                            OK
                          </Badge>
                        {:else}
                          <Badge variant="secondary" class="text-xs">
                            <CircleDashed class="mr-1 size-3" />
                            {$LL.admin.import.pending()}
                          </Badge>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#if validRows.length > 10}
                {@const rowCount = validRows.length}
                <p class="mt-2 text-sm text-muted-foreground">
                  {$LL.admin.import.showingRows({ rowCount })}
                </p>
              {/if}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</main>
