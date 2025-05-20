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
	import { Separator } from "$lib/components/ui/separator";
	import UserCog from "@lucide/svelte/icons/user-cog";
	import { localizeHref } from "$lib/paraglide/runtime";

	let { data }: { data: PageServerData } = $props();

	const form = superForm(data.form, {
		validators: zodClient(schema),
		validationMethod: "oninput",
	});
	const { form: formData, enhance } = form;
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">
		{m.bad_crazy_termite_jump({ firstNames: data.user.firstNames ?? "", lastName: data.user.lastName ?? "" })}
	</h1>

	<div class="flex w-full max-w-2xl flex-col items-center gap-4 md:flex-row md:items-stretch">
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

		{#if data.user.isAdmin}
			<Separator class="hidden md:block" orientation="vertical" />
			<div class="flex w-full max-w-xs flex-col gap-4">
				<h2 class="font-mono text-lg">{m.each_strong_butterfly_seek()}</h2>
				<a
					href={localizeHref(route("/admin/memberships"))}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<UserCog class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">{m.raw_nimble_ibex_flow()}</p>
						<p class="text-sm text-muted-foreground">{m.jolly_due_snake_support()}</p>
					</div>
				</a>
				<a
					href={route("/admin/members")}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<UserCog class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">{m.warm_large_otter_push()}</p>
						<p class="text-sm text-muted-foreground">{m.legal_zany_tortoise_flop()}</p>
					</div>
				</a>
			</div>
		{/if}
	</div>
</main>
