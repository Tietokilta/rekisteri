<script lang="ts">
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import Papa from "papaparse";
	import { csvRowSchema, type CsvRow } from "./schema";
	import type { PageData, ActionData } from "./$types";
	import { enhance } from "$app/forms";
	import { SvelteSet } from "svelte/reactivity";
	import * as m from "$lib/paraglide/messages.js";

	let { data, form }: { data: PageData; form: ActionData } = $props();

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
				const validation = csvRowSchema.safeParse(rowData);

				if (!validation.success) {
					const errorMessages = validation.error.issues
						.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
						.join(", ");
					parseErrors.push(`Row ${i + 1}: ${errorMessages}`);
				} else {
					validatedRows.push(validation.data);
				}
			}

			rows = validatedRows;

			// Validate membership types
			const invalidTypes = new SvelteSet<string>();
			for (const row of validatedRows) {
				if (!data.types.includes(row.membershipType)) {
					invalidTypes.add(row.membershipType);
				}
			}

			if (invalidTypes.size > 0) {
				parseErrors.push(
					`Invalid membership types: ${Array.from(invalidTypes).join(", ")}. Available types: ${data.types.join(", ")}`,
				);
			}
		};

		if (csvFile && csvFile.type === "text/csv") {
			void readFile(csvFile);
		}
	});

	const canImport = $derived(rows.length > 0 && parseErrors.length === 0 && !isImporting);

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
				(m) => m.type === row.membershipType && m.startTime.toISOString().split("T")[0] === row.membershipStartDate,
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

<main class="my-8 flex flex-col items-center justify-center p-4">
	<h1 class="mb-6 font-mono text-2xl font-semibold">{m.civil_spare_squirrel_tap()}</h1>

	<div class="flex w-full max-w-6xl flex-col gap-8 md:flex-row">
		<!-- Upload Section -->
		<div class="w-full md:w-1/3">
			<div class="rounded-lg border p-6">
				<h2 class="mb-4 text-lg font-medium">{m.watery_east_cobra_adapt()}</h2>
				<Label for="csv-input" class="mb-2">{m.inclusive_bright_pug_arise()}</Label>
				<Input id="csv-input" type="file" accept="text/csv,.csv" bind:files class="mb-4" />

				<div class="rounded-md bg-muted p-4 text-sm">
					<p class="mb-2 font-medium">{m.brave_flat_cod_fear()}</p>
					<ul class="list-inside list-disc space-y-1 text-muted-foreground">
						{#each expectedColumns as column (column)}
							<li><code class="rounded bg-background px-1">{column}</code></li>
						{/each}
					</ul>
				</div>

				<div class="mt-4">
					<p class="mb-2 text-sm font-medium">{m.bright_topical_samuel_advise()}</p>
					<p class="mb-2 text-xs text-muted-foreground">
						{m.late_every_lobster_gulp()}
					</p>
					<ul class="space-y-2 text-sm text-muted-foreground">
						{#each data.memberships as membership (membership.id)}
							<li class="rounded bg-background p-2">
								<div class="font-medium">{membership.type}</div>
								<div class="text-xs">
									{m.trick_nice_poodle_borrow()} <code>{membership.startTime.toISOString().split("T")[0]}</code>
								</div>
								<div class="text-xs">
									{m.home_elegant_reindeer_adore()} <code>{membership.endTime.toISOString().split("T")[0]}</code>
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
				<h2 class="mb-4 text-lg font-medium">{m.yummy_sharp_parakeet_hunt()}</h2>

				{#if parseErrors.length > 0}
					<div class="mb-4 rounded-md border border-destructive bg-destructive/10 p-4">
						<p class="mb-2 font-medium text-destructive">{m.real_every_skunk_value()}</p>
						<ul class="list-inside list-disc space-y-1 text-sm text-destructive">
							{#each parseErrors as error, i (i)}
								<li>{error}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if form?.success}
					{@const successCount = form.successCount ?? 0}
					{@const totalRows = form.totalRows ?? 0}
					<div class="mb-4 rounded-md border border-green-600 bg-green-600/10 p-4">
						<p class="font-medium text-green-600">{m.bad_raw_falcon_swim()}</p>
						<p class="text-sm text-green-600">
							{m.quaint_sad_goat_learn({ successCount, totalRows })}
						</p>
						{#if form.errors && form.errors.length > 0}
							{@const errorCount = form.errors.length}
							<details class="mt-2">
								<summary class="cursor-pointer text-sm text-green-600">
									{m.born_glad_alligator_sprout({ errorCount })}
								</summary>
								<ul class="mt-2 list-inside list-disc space-y-1 text-sm">
									{#each form.errors as error, i (i)}
										<li>Row {error.row} ({error.email}): {error.error}</li>
									{/each}
								</ul>
							</details>
						{/if}
					</div>
				{:else if form?.success === false}
					<div class="mb-4 rounded-md border border-destructive bg-destructive/10 p-4">
						<p class="font-medium text-destructive">{m.pretty_green_slug_taste()}</p>
						<p class="text-sm text-destructive">{form.message}</p>
					</div>
				{/if}

				{#if rows.length > 0 && importPreview}
					<div class="mb-4 rounded-md border bg-blue-600/10 p-4">
						<p class="mb-3 font-medium text-blue-600">{m.tasty_gaudy_squirrel_rest()}</p>
						<div class="space-y-2 text-sm">
							<div class="flex items-center justify-between">
								<span class="text-muted-foreground">{m.jolly_close_zebra_propel()}</span>
								<span class="font-medium">{importPreview.userCount}</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-muted-foreground">{m.sleek_novel_mouse_smile()}</span>
								<span class="font-medium">{importPreview.memberRecords}</span>
							</div>
							<div class="mt-3 border-t pt-2">
								<div class="flex items-center justify-between">
									<span class="text-muted-foreground">{m.inner_smug_maggot_flow()}</span>
									<span class="font-medium text-green-600">{importPreview.activeCount}</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-muted-foreground">{m.weary_tense_pig_aid()}</span>
									<span class="font-medium text-orange-600">{importPreview.expiredCount}</span>
								</div>
							</div>
						</div>
						<p class="mt-3 text-xs text-muted-foreground">
							{m.seemly_lofty_dove_earn()}
						</p>
					</div>

					<div class="mb-4">
						<h3 class="mb-2 text-sm font-medium">{m.aware_nimble_lobster_push()}</h3>
						<div class="overflow-x-auto">
							<table class="w-full border-collapse text-sm">
								<thead>
									<tr class="border-b">
										<th class="p-2 text-left font-medium">{m.house_grand_wallaby_fond()}</th>
										<th class="p-2 text-left font-medium">{m.fancy_major_okapi_embrace()}</th>
										<th class="p-2 text-left font-medium">{m.stout_weak_bison_feast()}</th>
										<th class="p-2 text-left font-medium">{m.antsy_known_lark_jump()}</th>
										<th class="p-2 text-left font-medium">{m.dizzy_just_ant_assure()}</th>
										<th class="p-2 text-left font-medium">{m.any_dirty_turtle_swim()}</th>
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
									{m.vivid_brave_lemming_fond({ rowCount })}
								</p>
							{/if}
						</div>
					</div>

					<form
						method="post"
						action="?/import"
						use:enhance={() => {
							isImporting = true;
							return async ({ update }) => {
								await update();
								isImporting = false;
							};
						}}
					>
						<input type="hidden" name="rows" value={JSON.stringify(rows)} />
						<Button type="submit" disabled={!canImport} class="w-full">
							{isImporting ? m.gross_round_felix_bend() : m.dry_heroic_liger_ask({ count: rows.length })}
						</Button>
					</form>
				{:else if csvFile}
					<p class="text-sm text-muted-foreground">{m.brief_odd_hawk_believe()}</p>
				{:else}
					<p class="text-sm text-muted-foreground">{m.merry_sweet_piranha_inspire()}</p>
				{/if}
			</div>
		</div>
	</div>
</main>
