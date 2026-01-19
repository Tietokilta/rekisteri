<script lang="ts">
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import Papa from "papaparse";
	import { importMembers } from "./data.remote";
	import { csvRowSchema, importMembersSchema, type CsvRow } from "./schema";
	import type { PageData } from "./$types";
	import { SvelteSet } from "svelte/reactivity";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import * as v from "valibot";
	import AdminPageHeader from "$lib/components/admin-page-header.svelte";

	let { data }: { data: PageData } = $props();

	let files = $state<FileList>();
	let csvFile = $derived(files?.item(0));
	let parseErrors = $state<string[]>([]);
	let rows = $state<CsvRow[]>([]);
	let isImporting = $state(false);

	const expectedColumns = [
		"firstNames",
		"lastName",
		"homeMunicipality",
		"email",
		"membershipType",
		"membershipStartDate",
	] as const;

	$effect(() => {
		// Reset state when file changes
		parseErrors = [];
		rows = [];

		const readFile = async (file: File) => {
			const csvString = (await file.text()).trim();
			const csv = Papa.parse(csvString, {
				header: true,
			});

			// Validate columns
			const hasCorrectColumns =
				csv.meta.fields?.length === expectedColumns.length &&
				csv.meta.fields.every((field, i) => field === expectedColumns[i]);

			if (!hasCorrectColumns) {
				parseErrors.push(`CSV columns don't match expected columns: ${expectedColumns.join(", ")}`);
				return;
			}

			// Validate each row
			const validatedRows: CsvRow[] = [];

			for (let i = 0; i < csv.data.length; i++) {
				const rowData = csv.data[i];
				const validation = v.safeParse(csvRowSchema, rowData);

				if (validation.success) {
					validatedRows.push(validation.output);
				} else {
					const errorMessages = validation.issues
						.map((issue) => `${issue.path?.map((p) => p.key).join(".") || "field"}: ${issue.message}`)
						.join(", ");
					parseErrors.push(`Row ${i + 1}: ${errorMessages}`);
				}
			}

			rows = validatedRows;

			// Validate membership types (accepts both fi and en names)
			const invalidTypes = new SvelteSet<string>();
			for (const row of validatedRows) {
				if (!data.typeNames.includes(row.membershipType)) {
					invalidTypes.add(row.membershipType);
				}
			}

			if (invalidTypes.size > 0) {
				parseErrors.push(
					`Invalid membership types: ${Array.from(invalidTypes).join(", ")}. Available types: ${data.typeNames.join(", ")}`,
				);
			}
		};

		if (csvFile && csvFile.type === "text/csv") {
			void readFile(csvFile);
		}
	});

	const canImport = $derived(rows.length > 0 && parseErrors.length === 0 && !isImporting);

	// Helper to get localized membership type name
	function getTypeName(membership: (typeof data.memberships)[number]) {
		return $locale === "fi" ? membership.membershipType.name.fi : membership.membershipType.name.en;
	}

	// Helper to check if a membership matches a type name (accepts both fi and en)
	function matchesTypeName(membership: (typeof data.memberships)[number], typeName: string) {
		return membership.membershipType.name.fi === typeName || membership.membershipType.name.en === typeName;
	}

	// Calculate import preview
	const importPreview = $derived.by(() => {
		if (rows.length === 0) return null;

		const uniqueEmails = new Set(rows.map((r) => r.email));
		const memberRecords = rows.length;

		// Calculate active vs expired based on membership end dates
		let activeCount = 0;
		let expiredCount = 0;
		const now = new Date();

		for (const row of rows) {
			const membership = data.memberships.find(
				(m) =>
					matchesTypeName(m, row.membershipType) && m.startTime.toISOString().split("T")[0] === row.membershipStartDate,
			);
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
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
	<AdminPageHeader title={$LL.admin.import.title()} />

	<div class="flex w-full flex-col gap-8 md:flex-row">
		<!-- Upload Section -->
		<div class="w-full md:w-1/3">
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
					<p class="mb-2 text-sm font-medium">{$LL.admin.import.existingMemberships()}</p>
					<p class="mb-2 text-xs text-muted-foreground">
						{$LL.admin.import.matchNote()}
					</p>
					<ul class="space-y-2 text-sm text-muted-foreground">
						{#each data.memberships as membership (membership.id)}
							<li class="rounded bg-background p-2">
								<div class="font-medium">{getTypeName(membership)}</div>
								<div class="text-xs">
									{$LL.admin.import.start()} <code>{membership.startTime.toISOString().split("T")[0]}</code>
								</div>
								<div class="text-xs">
									{$LL.admin.import.end()} <code>{membership.endTime.toISOString().split("T")[0]}</code>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>

		<!-- Preview Section -->
		<div class="flex-1">
			<div class="rounded-lg border p-6">
				<h2 class="mb-4 text-lg font-medium">{$LL.admin.import.step2()}</h2>

				{#if parseErrors.length > 0}
					<div class="mb-4 rounded-md border border-destructive bg-destructive/10 p-4">
						<p class="mb-2 font-medium text-destructive">{$LL.admin.import.validationErrors()}</p>
						<ul class="list-inside list-disc space-y-1 text-sm text-destructive">
							{#each parseErrors as error, i (i)}
								<li>{error}</li>
							{/each}
						</ul>
					</div>
				{/if}

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

				{#if rows.length > 0 && importPreview}
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

					<div class="mb-4">
						<h3 class="mb-2 text-sm font-medium">{$LL.admin.import.dataPreview()}</h3>
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
									</tr>
								</thead>
								<tbody>
									{#each rows.slice(0, 10) as row, i (i)}
										<tr class="border-b hover:bg-muted/50">
											<td class="p-2">{row.firstNames}</td>
											<td class="p-2">{row.lastName}</td>
											<td class="p-2">{row.homeMunicipality}</td>
											<td class="p-2">{row.email}</td>
											<td class="p-2">{row.membershipType}</td>
											<td class="p-2">{row.membershipStartDate}</td>
										</tr>
									{/each}
								</tbody>
							</table>
							{#if rows.length > 10}
								{@const rowCount = rows.length}
								<p class="mt-2 text-sm text-muted-foreground">
									{$LL.admin.import.showingRows({ rowCount })}
								</p>
							{/if}
						</div>
					</div>

					<form
						{...importMembers.preflight(importMembersSchema).enhance(async ({ submit }) => {
							isImporting = true;
							await submit();
							isImporting = false;
						})}
					>
						<input {...importMembers.fields.rows.as("hidden", JSON.stringify(rows))} />
						<Button type="submit" disabled={!canImport} class="w-full">
							{isImporting ? $LL.admin.import.importing() : $LL.admin.import.importButton({ count: rows.length })}
						</Button>
					</form>
				{:else if csvFile}
					<p class="text-sm text-muted-foreground">{$LL.admin.import.noRows()}</p>
				{:else}
					<p class="text-sm text-muted-foreground">{$LL.admin.import.uploadPrompt()}</p>
				{/if}
			</div>
		</div>
	</div>
</main>
