<script lang="ts">
	import { Input } from "$lib/components/ui/input/index.js";
	import type { PageServerData } from "./$types";
	import * as m from "$lib/paraglide/messages.js";
	import { Switch } from "$lib/components/ui/switch";
	import { zodClient } from "sveltekit-superforms/adapters";
	import { superForm } from "sveltekit-superforms";
	import { schema } from "./schema";
	import * as Form from "$lib/components/ui/form/index.js";
	import { route } from "$lib/ROUTES";

	let { data }: { data: PageServerData } = $props();

	const form = superForm(data.form, {
		validators: zodClient(schema),
		validationMethod: "oninput",
	});
	const { form: formData, enhance } = form;
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">Welcome {data.user.email}!</h1>

	<div class="w-full max-w-xs">
		<h2 class="font-mono text-lg">{m.bold_proof_grizzly_rush()}</h2>

		<form method="post" action={route("saveInfo /")} use:enhance class="flex w-full max-w-xs flex-col gap-4">
			<Form.Field {form} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.dark_weak_vulture_bless()}</Form.Label>
						<Input {...props} type="email" readonly bind:value={$formData.email} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="firstNames">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.giant_jolly_mayfly_lead()}</Form.Label>
						<Input {...props} bind:value={$formData.firstNames} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="lastName">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.frail_fine_fish_chop()}</Form.Label>
						<Input {...props} bind:value={$formData.lastName} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="homeMunicipality">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.lofty_patient_squid_drop()}</Form.Label>
						<Input {...props} bind:value={$formData.homeMunicipality} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field
				{form}
				name="isAllowedEmails"
				class="space-y flex flex-row items-center justify-between rounded-lg border p-4"
			>
				<Form.Control>
					{#snippet children({ props })}
						<div class="space-y-0.5">
							<Form.Label>{m.light_frail_poodle_enrich()}</Form.Label>
							<Form.Description>{m.livid_trite_thrush_animate()}</Form.Description>
						</div>
						<Switch {...props} bind:checked={$formData.isAllowedEmails} />
					{/snippet}
				</Form.Control>
			</Form.Field>

			<Form.Button type="submit">{m.tough_mellow_porpoise_explore()}</Form.Button>

			<Form.Button formnovalidate formmethod="post" formaction={route("signOut /")} variant="outline"
				>{m.brief_early_scallop_bless()}</Form.Button
			>
		</form>
	</div>
</main>
