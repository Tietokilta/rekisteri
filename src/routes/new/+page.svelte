<script lang="ts">
	import type { PageProps } from "./$types";
	import * as m from "$lib/paraglide/messages.js";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { superForm } from "sveltekit-superforms";
	import { schema } from "./schema";
	import { route } from "$lib/ROUTES";
	import * as Form from "$lib/components/ui/form/index.js";
	import { getLocale } from "$lib/paraglide/runtime";

	const { data }: PageProps = $props();

	const form = superForm(data.form, {
		validators: zod4Client(schema),
	});
	const { form: formData, enhance } = form;

	const { memberships, availableMemberships } = data;
	const filteredMemberships = availableMemberships.filter((a) => !memberships.some((b) => a.id === b.id));
</script>

<main class="my-4 flex flex-col items-center justify-center">
	<h1 class="font-mono text-lg">{m.proof_spicy_mule_loop()}</h1>
	<form method="post" action={route("payMembership /new")} use:enhance class="flex w-full max-w-xs flex-col gap-4">
		<Form.Field {form} name="membershipId" class="space-y flex flex-col gap-1 rounded-lg border p-4">
			<Form.Control>
				<Form.Label>{m.muddy_upper_puma_persist()}</Form.Label>
				<select class="bg-background" name="membershipId" bind:value={$formData.membershipId} required>
					{#each filteredMemberships as membership (membership.id)}
						<option value={membership.id}>
							{membership.type} - {new Date(membership.startTime).toLocaleDateString(`${getLocale()}-FI`)} – {new Date(
								membership.endTime,
							).toLocaleDateString(`${getLocale()}-FI`)} ({membership.priceCents / 100} €)
						</option>
					{/each}
				</select>
			</Form.Control>
		</Form.Field>
		<Form.Button type="submit">
			{m.proof_spicy_mule_loop()}
			{#if $formData.membershipId}
				({(availableMemberships.find((x) => x.id === $formData.membershipId)?.priceCents ?? 0) / 100} €)
			{/if}
		</Form.Button>
	</form>
</main>
