<script lang="ts">
	import type { PageProps } from "./$types";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { superForm } from "sveltekit-superforms";
	import { schema } from "./schema";
	import { route } from "$lib/ROUTES";
	import * as Form from "$lib/components/ui/form/index.js";

	const { data }: PageProps = $props();

	const form = superForm(data.form, {
		validators: zod4Client(schema),
	});
	const { form: formData, enhance } = form;

	const { memberships, availableMemberships } = data;
	const filteredMemberships = availableMemberships.filter((a) => !memberships.some((b) => a.id === b.id));

	let isStudent = $state(false);
	let requireStudentVerification = $derived(
		availableMemberships.find((e) => e.id === $formData.membershipId)?.requiresStudentVerification ?? false,
	);
	let disableForm = $derived(!isStudent && requireStudentVerification);
</script>

<main class="my-4 flex flex-col items-center justify-center">
	<h1 class="font-mono text-lg">{$LL.membership.buy()}</h1>
	<form method="post" action={route("payMembership /new")} use:enhance class="flex w-full max-w-xs flex-col gap-4">
		<div class="space-y flex flex-col gap-1 rounded-lg border p-4">
			<Form.Field {form} name="membershipId">
				<Form.Control>
					<Form.Label>{$LL.membership.select()}</Form.Label>
					{#each filteredMemberships as membership (membership.id)}
						<label
							class="flex items-start gap-3 rounded-lg border p-4 focus-within:border-primary hover:border-primary"
						>
							<input
								type="radio"
								name="membershipId"
								value={membership.id}
								bind:group={$formData.membershipId}
								required
							/>
							<div class="flex flex-col">
								<span class="font-medium">
									{membership.type} ({membership.priceCents / 100} €)
								</span>
								<span class="text-sm text-muted-foreground">
									{new Date(membership.startTime).toLocaleDateString(`${$locale}-FI`)}
									– {new Date(membership.endTime).toLocaleDateString(`${$locale}-FI`)}
								</span>
							</div>
						</label>
					{/each}
				</Form.Control>
			</Form.Field>

			{#if requireStudentVerification}
				<div class="mt-4 rounded-lg border p-4">
					<label class="flex items-start gap-3">
						<input type="checkbox" name="isStudent" bind:checked={isStudent} required class="rounded" />
						<span class="text-sm">{$LL.membership.isStudent()}</span>
					</label>
				</div>
			{/if}
		</div>

		<Form.Button type="submit" disabled={disableForm} class={disableForm ? "cursor-not-allowed opacity-50" : ""}>
			{$LL.membership.buy()}
			{#if $formData.membershipId}
				({(availableMemberships.find((x) => x.id === $formData.membershipId)?.priceCents ?? 0) / 100} €)
			{/if}
		</Form.Button>
	</form>
</main>
