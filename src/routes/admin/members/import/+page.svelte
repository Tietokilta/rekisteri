<script lang="ts">
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import Papa from "papaparse";
	import * as z from "zod";

	let files = $state<FileList>();
	let csvFile = $derived(files?.item(0));
	let errors = $state<string[]>([]);
	let rows = $state<z.infer<typeof csvDataSchema>>([]);

	const csvDataSchema = z
		.object({
			firstNames: z.string(),
			lastName: z.string(),
			homeMunicipality: z.string(),
			email: z.string(),
			membershipType: z.string(),
		})
		.array();
	const expectedColumns = ["firstNames", "lastName", "homeMunicipality", "email", "membershipType"] as const;

	$effect(() => {
		const readFile = async (file: File) => {
			const csvString = (await file.text()).trim();
			const csv = Papa.parse(csvString, {
				header: true,
			});
			const hasCorrectColumns =
				csv.meta.fields?.length === expectedColumns.length &&
				csv.meta.fields.every((field, i) => field === expectedColumns[i]);
			if (!hasCorrectColumns) {
				errors.push("CSV-tiedoston sarakkeet eivät täsmää odotettuihin sarakkeisiin.");
			}
			const csvData = csvDataSchema.safeParse(csv.data);
			if (!csvData.success) {
				const rowErrors = Object.values(csvData.error.format());
				const firstRowErrors = rowErrors.at(0);
				const firstRowErrorsS = firstRowErrors
					? Object.entries(firstRowErrors)
							.filter(([key]) => key !== "_errors")
							.map(([key, value]) => `${key}: ${value._errors}`)
					: [];
				console.log(rowErrors);
				console.log(firstRowErrorsS);
				errors.push(...firstRowErrorsS);
			}
			rows = csvData.data ?? [];
			console.log(csv, hasCorrectColumns, csvData.data);
		};

		console.log(csvFile, csvFile?.type);
		if (csvFile && csvFile.type === "text/csv") {
			void readFile(csvFile);
		}
	});
</script>

<main class="my-4 flex flex-col items-center justify-center">
	<h1 class="font-mono text-lg">Tuo jäseniä</h1>
	<div class="flex w-full max-w-2xl flex-col items-center gap-4 md:flex-row md:items-stretch">
		<div class="w-full max-w-xs">
			<Label for="csv-input">CSV-tiedosto</Label>
			<Input id="csv-input" type="file" accept="text/csv,.csv" bind:files />
			{#each errors as error (error)}
				<div class="text-destructive">
					{error}
				</div>
			{/each}
		</div>
		<div class="w-full max-w-xs">
			<p>{rows.length} jäsentä</p>
			<table>
				<thead>
					<tr>
						<th>Etunimet</th>
						<th>Sukunimi</th>
						<th>Kotikunta</th>
						<th>Jäsenyyden tyyppi</th>
					</tr>
				</thead>
				<tbody>
					{#each rows.slice(0, 5) as row, i (i)}
						<tr>
							<td>{row.firstNames ?? "-"}</td>
							<td>{row.lastName ?? "-"}</td>
							<td>{row.homeMunicipality ?? "-"}</td>
							<td>{row.membershipType ?? "-"}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</main>
