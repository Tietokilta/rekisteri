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
	import { SvelteSet, SvelteMap } from "svelte/reactivity";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import * as v from "valibot";
	import AdminPageHeader from "$lib/components/admin-page-header.svelte";
	import { invalidateAll } from "$app/navigation";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import CircleAlert from "@lucide/svelte/icons/circle-alert";
	import CircleDashed from "@lucide/svelte/icons/circle-dashed";
	import Plus from "@lucide/svelte/icons/plus";
	import type { CsvRow } from "./schema";

	let { data }: { data: PageData } = $props();

	let files = $state<FileList>();
	let csvFile = $derived(files?.item(0));
	let isImporting = $state(false);

	// Parsed and validated rows
	let validRows = $state<CsvRow[]>([]);
	let validationErrors = $state<Array<{ row: number; message: string }>>([]);

	// Categorized rows
	type AnalyzedRow = CsvRow & {
		rowIndex: number;
		matchedMembershipId?: string;
	};

	let matchedRows = $state<AnalyzedRow[]>([]);
	let unmatchedRows = $state<AnalyzedRow[]>([]);

	// Unmatched membership keys (typeId + startDate)
	type UnmatchedMembership = {
		key: string;
		membershipTypeId: string;
		startDate: string;
		inferredEndDate: string;
		rowCount: number;
		linkedMembershipId?: string;
		status: "pending" | "creating" | "created" | "error";
	};

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

	// Analyze rows helper function
	// Takes previousUnmatched to preserve linked/created status across re-analysis
	function analyzeRows(rows: CsvRow[], previousUnmatched: UnmatchedMembership[] = []) {
		const matched: AnalyzedRow[] = [];
		const unmatched: AnalyzedRow[] = [];
		const unmatchedKeys = new SvelteMap<string, UnmatchedMembership>();

		// Build lookup map from previous state to preserve user actions (links, created status)
		const previousByKey = new Map(previousUnmatched.map((m) => [m.key, m]));

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (!row) continue;
			const membership = findMembership(row.membershipTypeId, row.membershipStartDate);

			if (membership) {
				matched.push({ ...row, rowIndex: i, matchedMembershipId: membership.id });
			} else {
				unmatched.push({ ...row, rowIndex: i });

				// Track unique unmatched memberships
				const key = `${row.membershipTypeId}|${row.membershipStartDate}`;
				const existingEntry = unmatchedKeys.get(key);
				if (existingEntry) {
					existingEntry.rowCount++;
				} else {
					const previous = previousByKey.get(key);
					unmatchedKeys.set(key, {
						key,
						membershipTypeId: row.membershipTypeId,
						startDate: row.membershipStartDate,
						inferredEndDate: inferEndDate(row.membershipStartDate),
						rowCount: 1,
						linkedMembershipId: previous?.linkedMembershipId,
						status: previous?.status ?? "pending",
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

	// Analyze CSV when file changes
	$effect(() => {
		// Reset state
		validRows = [];
		validationErrors = [];
		matchedRows = [];
		unmatchedRows = [];
		unmatchedMemberships = [];

		if (!csvFile || csvFile.type !== "text/csv") return;

		const readFile = async (file: File) => {
			const csvString = (await file.text()).trim();
			const csv = Papa.parse(csvString, { header: true });

			// Validate columns
			const hasCorrectColumns =
				csv.meta.fields?.length === expectedColumns.length &&
				csv.meta.fields.every((field, i) => field === expectedColumns[i]);

			if (!hasCorrectColumns) {
				validationErrors = [{ row: 0, message: `CSV columns don't match expected: ${expectedColumns.join(", ")}` }];
				return;
			}

			// Validate each row
			const validated: CsvRow[] = [];
			const errors: Array<{ row: number; message: string }> = [];

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
			const invalidTypes = new SvelteSet<string>();
			for (const row of validated) {
				if (!data.typeIds.includes(row.membershipTypeId)) {
					invalidTypes.add(row.membershipTypeId);
				}
			}

			if (invalidTypes.size > 0) {
				validationErrors = [
					...validationErrors,
					{
						row: 0,
						message: `Invalid membership type IDs: ${Array.from(invalidTypes).join(", ")}. Available IDs: ${data.typeIds.join(", ")}`,
					},
				];
			}

			// Analyze rows (even if there are type ID errors, to show helpful info)
			const analysis = analyzeRows(validated);
			matchedRows = analysis.matched;
			unmatchedRows = analysis.unmatched;
			unmatchedMemberships = analysis.unmatchedMemberships;
		};

		void readFile(csvFile);
	});

	// Reanalyze when memberships data changes (after creating new ones)
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		data.memberships; // Track dependency
		if (validRows.length === 0) return;

		// Pass current unmatchedMemberships to preserve linked/created status
		const analysis = analyzeRows(validRows, unmatchedMemberships);
		matchedRows = analysis.matched;
		unmatchedRows = analysis.unmatched;
		unmatchedMemberships = analysis.unmatchedMemberships;
	});

	// Check if all unmatched are resolved (either created or linked)
	const allResolved = $derived(unmatchedMemberships.every((m) => m.status === "created" || m.linkedMembershipId));

	// Check if all type IDs are valid
	const hasInvalidTypeIds = $derived(validationErrors.some((e) => e.message.includes("Invalid membership type IDs")));

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

		try {
			const result = await createLegacyMembership({
				membershipTypeId: membership.membershipTypeId,
				startTime: membership.startDate,
				endTime: membership.inferredEndDate,
			});

			if (result?.success) {
				updateMembershipStatus(membership.key, "created");
				await invalidateAll();
			} else {
				updateMembershipStatus(membership.key, "error");
			}
		} catch {
			updateMembershipStatus(membership.key, "error");
		}
	}

	// Create all missing memberships at once
	let isCreatingAll = $state(false);

	async function handleCreateAllMissing() {
		const toCreate = unmatchedMemberships.filter((m) => m.status === "pending" && !m.linkedMembershipId);
		if (toCreate.length === 0) return;

		isCreatingAll = true;

		// Mark all as creating (immutable update)
		const keysToCreate = new Set(toCreate.map((m) => m.key));
		unmatchedMemberships = unmatchedMemberships.map((m) =>
			keysToCreate.has(m.key) ? { ...m, status: "creating" as const } : m,
		);

		const membershipsData = toCreate.map((m) => ({
			membershipTypeId: m.membershipTypeId,
			startTime: m.startDate,
			endTime: m.inferredEndDate,
		}));

		try {
			const result = await createLegacyMemberships({ memberships: membershipsData });

			if (result?.success) {
				unmatchedMemberships = unmatchedMemberships.map((m) =>
					keysToCreate.has(m.key) ? { ...m, status: "created" as const } : m,
				);
				await invalidateAll();
			} else {
				unmatchedMemberships = unmatchedMemberships.map((m) =>
					keysToCreate.has(m.key) ? { ...m, status: "error" as const } : m,
				);
			}
		} catch {
			unmatchedMemberships = unmatchedMemberships.map((m) =>
				keysToCreate.has(m.key) ? { ...m, status: "error" as const } : m,
			);
		}

		isCreatingAll = false;
	}

	// Link to existing membership
	function handleLinkToExisting(membership: UnmatchedMembership, membershipId: string) {
		unmatchedMemberships = unmatchedMemberships.map((m) =>
			m.key === membership.key ? { ...m, linkedMembershipId: membershipId || undefined } : m,
		);
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

	// Sort memberships for dropdown (same type first, then by date proximity)
	function sortedMembershipsForRow(membershipTypeId: string, startDate: string) {
		const targetDate = new Date(startDate).getTime();
		return [...data.memberships].toSorted((a, b) => {
			// Same type first
			const aTypeMatch = a.membershipTypeId === membershipTypeId ? 0 : 1;
			const bTypeMatch = b.membershipTypeId === membershipTypeId ? 0 : 1;
			if (aTypeMatch !== bTypeMatch) return aTypeMatch - bTypeMatch;

			// Then by date proximity
			const aDistance = Math.abs(a.startTime.getTime() - targetDate);
			const bDistance = Math.abs(b.startTime.getTime() - targetDate);
			return aDistance - bDistance;
		});
	}

	// Get display name for membership in dropdown
	function getMembershipDisplayName(membership: (typeof data.memberships)[number]) {
		const typeName = getTypeName(membership.membershipTypeId);
		return `${typeName} (${membership.startTime.toISOString().split("T")[0]})`;
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
							<li>Row {error.row}: {error.message}</li>
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
								<div class="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
									<div class="min-w-48 flex-1">
										<p class="font-medium">{getTypeName(membership.membershipTypeId)}</p>
										<p class="text-xs text-muted-foreground">
											ID: <code>{membership.membershipTypeId}</code>
										</p>
										<p class="text-sm text-muted-foreground">
											{$LL.admin.import.start()} <code>{membership.startDate}</code>
										</p>
										<p class="text-xs text-muted-foreground">
											{$LL.admin.import.rowsAffected({ count: membership.rowCount })}
										</p>
									</div>

									{#if membership.status === "created"}
										<Badge variant="default" class="bg-green-600">
											<CircleCheck class="mr-1 size-3" />
											{$LL.admin.import.created()}
										</Badge>
									{:else if membership.status === "creating"}
										<Badge variant="secondary">
											{$LL.admin.import.creating()}
										</Badge>
									{:else if membership.status === "error"}
										<Badge variant="destructive">
											<CircleAlert class="mr-1 size-3" />
											{$LL.admin.import.createFailed()}
										</Badge>
									{:else if membership.linkedMembershipId}
										<Badge variant="secondary">
											<CircleCheck class="mr-1 size-3" />
											{$LL.admin.import.linked()}
										</Badge>
									{:else}
										<div class="flex flex-wrap items-center gap-2">
											<Button variant="outline" size="sm" onclick={() => handleQuickCreate(membership)}>
												<Plus class="mr-1 size-4" />
												{$LL.admin.import.quickCreate()}
											</Button>

											<span class="text-sm text-muted-foreground">or</span>

											<NativeSelect.Root
												class="w-48"
												value={membership.linkedMembershipId ?? ""}
												onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
													handleLinkToExisting(membership, e.currentTarget.value)}
											>
												<NativeSelect.Option value="">{$LL.admin.import.selectMembership()}</NativeSelect.Option>
												{#each sortedMembershipsForRow(membership.membershipTypeId, membership.startDate) as m (m.id)}
													<NativeSelect.Option value={m.id}>
														{getMembershipDisplayName(m)}
													</NativeSelect.Option>
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
										<li>Row {error.row} ({error.email}): {error.error}</li>
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
										<th class="p-2 text-left font-medium">Status</th>
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
														Pending
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
