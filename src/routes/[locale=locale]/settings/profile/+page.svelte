<script lang="ts">
	import { untrack } from "svelte";
	import { Input } from "$lib/components/ui/input/index.js";
	import type { PageServerData } from "./$types";
	import { LL } from "$lib/i18n/i18n-svelte";
	import { Switch } from "$lib/components/ui/switch";
	import { saveUserInfo } from "../../data.remote";
	import { userInfoSchema } from "../../schema";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import * as Card from "$lib/components/ui/card/index.js";
	import { toast } from "svelte-sonner";

	let { data }: { data: PageServerData } = $props();

	// Initialize form fields once when component mounts
	// Using untrack to prevent re-running when form fields change
	$effect(() => {
		untrack(() => {
			saveUserInfo.fields.set({
				email: data.user.email,
				firstNames: data.user.firstNames ?? "",
				lastName: data.user.lastName ?? "",
				homeMunicipality: data.user.homeMunicipality ?? "",
				preferredLanguage: data.user.preferredLanguage ?? "unspecified",
				isAllowedEmails: data.user.isAllowedEmails,
			});
		});
	});

	// Track if form has been validated (after first blur or submit attempt)
	// "Reward early, validate late" pattern
	let hasValidated = $state(false);

	function handleBlur() {
		hasValidated = true;
		saveUserInfo.validate();
	}

	function handleInput() {
		// Only validate on input after initial validation
		if (hasValidated) {
			saveUserInfo.validate();
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$LL.settings.profile.title()}</Card.Title>
		<Card.Description>{$LL.settings.profile.description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			{...saveUserInfo.preflight(userInfoSchema).enhance(async ({ submit }) => {
				try {
					await submit();
					toast.success($LL.user.saveSuccess());
				} catch {
					toast.error($LL.user.saveError());
				}
			})}
			class="flex flex-col gap-4"
		>
			<div class="space-y-2">
				<Label for="email">{$LL.user.email()}</Label>
				<Input
					{...saveUserInfo.fields.email.as("email")}
					id="email"
					autocomplete="email"
					autocapitalize="none"
					autocorrect="off"
					readonly
				/>
				{#each saveUserInfo.fields.email.issues() as issue, i (i)}
					<p class="text-sm text-destructive">{issue.message}</p>
				{/each}
			</div>

			<div class="space-y-2">
				<Label for="firstNames">{$LL.user.firstNames()}</Label>
				<Input
					{...saveUserInfo.fields.firstNames.as("text")}
					id="firstNames"
					autocomplete="given-name"
					onblur={handleBlur}
					oninput={handleInput}
					data-testid="firstNames-input"
				/>
				{#each saveUserInfo.fields.firstNames.issues() as issue, i (i)}
					<p class="text-sm text-destructive" data-testid="firstNames-error">{issue.message}</p>
				{/each}
			</div>

			<div class="space-y-2">
				<Label for="lastName">{$LL.user.lastName()}</Label>
				<Input
					{...saveUserInfo.fields.lastName.as("text")}
					id="lastName"
					autocomplete="family-name"
					onblur={handleBlur}
					oninput={handleInput}
					data-testid="lastName-input"
				/>
				{#each saveUserInfo.fields.lastName.issues() as issue, i (i)}
					<p class="text-sm text-destructive" data-testid="lastName-error">{issue.message}</p>
				{/each}
			</div>

			<div class="space-y-2">
				<Label for="homeMunicipality">{$LL.user.homeMunicipality()}</Label>
				<Input
					{...saveUserInfo.fields.homeMunicipality.as("text")}
					id="homeMunicipality"
					autocomplete="address-level2"
					onblur={handleBlur}
					oninput={handleInput}
					data-testid="homeMunicipality-input"
				/>
				{#each saveUserInfo.fields.homeMunicipality.issues() as issue, i (i)}
					<p class="text-sm text-destructive" data-testid="homeMunicipality-error">{issue.message}</p>
				{/each}
			</div>

			<div class="space-y-2">
				<Label for="preferredLanguage">{$LL.user.preferredLanguage()}</Label>
				<p class="text-sm text-muted-foreground">{$LL.user.preferredLanguageDescription()}</p>
				<select
					{...saveUserInfo.fields.preferredLanguage.as("select")}
					id="preferredLanguage"
					autocomplete="language"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					<option value="unspecified">{$LL.user.preferredLanguageOptions.unspecified()}</option>
					<option value="finnish">{$LL.user.preferredLanguageOptions.finnish()}</option>
					<option value="english">{$LL.user.preferredLanguageOptions.english()}</option>
				</select>
				{#each saveUserInfo.fields.preferredLanguage.issues() as issue, i (i)}
					<p class="text-sm text-destructive">{issue.message}</p>
				{/each}
			</div>

			<div class="space-y flex flex-row items-center justify-between rounded-lg border p-4">
				<div class="space-y-0.5">
					<Label for="isAllowedEmails">{$LL.user.allowEmails()}</Label>
					<p class="text-sm text-muted-foreground">{$LL.user.allowEmailsDescription()}</p>
				</div>
				<Switch {...saveUserInfo.fields.isAllowedEmails.as("checkbox")} id="isAllowedEmails" />
			</div>

			<Button type="submit">{$LL.common.save()}</Button>
		</form>
	</Card.Content>
</Card.Root>
