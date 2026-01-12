<script lang="ts">
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { route } from "$lib/ROUTES";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import * as Alert from "$lib/components/ui/alert/index.js";
	import { addSecondaryEmailForm, addSecondaryEmailSchema } from "$lib/api/secondary-emails.remote";
</script>

<main class="container mx-auto my-8 max-w-md p-4">
	<h1 class="mb-4 text-2xl font-bold">{$LL.secondaryEmail.addEmail()}</h1>

	<Alert.Root class="mb-4">
		<Alert.Description>{$LL.secondaryEmail.infoExpiring()}</Alert.Description>
	</Alert.Root>

	{#each addSecondaryEmailForm.fields.allIssues() as issue, i (i)}
		<Alert.Root variant="destructive" class="mb-4" data-testid="add-email-error">
			<Alert.Description>{issue.message}</Alert.Description>
		</Alert.Root>
	{/each}

	<form
		{...addSecondaryEmailForm.preflight(addSecondaryEmailSchema)}
		oninput={() => addSecondaryEmailForm.validate()}
		class="space-y-4"
	>
		<div class="space-y-2">
			<Label for="email">{$LL.secondaryEmail.emailAddress()}</Label>
			<Input
				{...addSecondaryEmailForm.fields.email.as("email")}
				id="email"
				placeholder={$LL.secondaryEmail.emailPlaceholder()}
				autocomplete="email"
				autocapitalize="none"
				autocorrect="off"
			/>
			{#each addSecondaryEmailForm.fields.email.issues() as issue, i (i)}
				<p class="text-sm text-destructive">{issue.message}</p>
			{/each}
		</div>

		<Button type="submit" class="w-full" data-testid="submit-add-email">
			{$LL.secondaryEmail.addAndVerify()}
		</Button>

		<Button variant="outline" href={route("/[locale=locale]/secondary-emails", { locale: $locale })} class="w-full">
			{$LL.auth.passkey.cancel()}
		</Button>
	</form>
</main>
