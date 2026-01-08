<script lang="ts">
	import { superForm } from "sveltekit-superforms";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { route } from "$lib/ROUTES";
	import * as Form from "$lib/components/ui/form/index.js";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import * as Alert from "$lib/components/ui/alert/index.js";
	import { schema } from "./schema";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	const form = superForm(data.form, {
		validators: zod4Client(schema),
		resetForm: false,
	});
	const { form: formData, enhance, message } = form;
</script>

<main class="container mx-auto my-8 max-w-md p-4">
	<h1 class="mb-4 text-2xl font-bold">{$LL.secondaryEmail.addEmail()}</h1>

	<Alert.Root class="mb-4">
		<Alert.Description>{$LL.secondaryEmail.infoExpiring()}</Alert.Description>
	</Alert.Root>

	{#if $message}
		<Alert.Root variant="destructive" class="mb-4" data-testid="add-email-error">
			<Alert.Description>{$message}</Alert.Description>
		</Alert.Root>
	{/if}

	<form method="post" use:enhance class="space-y-4">
		<Form.Field {form} name="email">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>{$LL.secondaryEmail.emailAddress()}</Form.Label>
					<Input
						{...props}
						type="email"
						placeholder={$LL.secondaryEmail.emailPlaceholder()}
						autocomplete="email"
						autocapitalize="none"
						autocorrect="off"
						bind:value={$formData.email}
					/>
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Button type="submit" class="w-full" data-testid="submit-add-email">
			{$LL.secondaryEmail.addAndVerify()}
		</Form.Button>

		<Button variant="outline" href={route("/[locale=locale]/secondary-emails", { locale: $locale })} class="w-full">
			{$LL.auth.passkey.cancel()}
		</Button>
	</form>
</main>
