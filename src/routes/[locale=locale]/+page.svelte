<script lang="ts">
	import { Input } from "$lib/components/ui/input/index.js";
	import type { PageServerData } from "./$types";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { Switch } from "$lib/components/ui/switch";
	import { saveUserInfo, signOut } from "./data.remote";
	import { userInfoSchema } from "./schema";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import { route } from "$lib/ROUTES";
	import { Separator } from "$lib/components/ui/separator";
	import UserCog from "@lucide/svelte/icons/user-cog";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import CircleAlert from "@lucide/svelte/icons/circle-alert";
	import Trash from "@lucide/svelte/icons/trash";
	import Hourglass from "@lucide/svelte/icons/hourglass";
	import Banknote from "@lucide/svelte/icons/banknote";
	import { toast } from "svelte-sonner";
	import * as z from "zod";
	import { fi, en } from "zod/locales";
	import KeyRound from "@lucide/svelte/icons/key-round";
	import Mail from "@lucide/svelte/icons/mail";
	import PasskeyRegistrationBanner from "$lib/components/PasskeyRegistrationBanner.svelte";

	let { data }: { data: PageServerData } = $props();

	// Configure Zod locale based on current language
	$effect(() => {
		z.config($locale === "fi" ? fi() : en());
	});

	saveUserInfo.fields.set({
		email: data.user.email,
		firstNames: data.user.firstNames ?? "",
		lastName: data.user.lastName ?? "",
		homeMunicipality: data.user.homeMunicipality ?? "",
		preferredLanguage: data.user.preferredLanguage ?? "unspecified",
		isAllowedEmails: data.user.isAllowedEmails,
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

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">
		{$LL.user.welcome({ firstNames: data.user.firstNames ?? "", lastName: data.user.lastName ?? "" })}
	</h1>

	<PasskeyRegistrationBanner user={data.user} />

	<div class="flex w-full max-w-2xl flex-col items-center gap-4 md:flex-row md:items-stretch">
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{$LL.user.editInfo()}</h2>

			<form
				{...saveUserInfo.preflight(userInfoSchema).enhance(async ({ submit }) => {
					try {
						await submit();
						toast.success($LL.user.saveSuccess());
					} catch {
						toast.error($LL.user.saveError());
					}
				})}
				class="flex w-full max-w-xs flex-col gap-4"
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

				<a
					href={route(`/[locale=locale]/passkeys`, { locale: $locale })}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<KeyRound class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">{$LL.auth.passkey.title()}</p>
						<p class="text-sm text-muted-foreground">{$LL.auth.passkey.manageDescription()}</p>
					</div>
				</a>

				<a
					href={route(`/[locale=locale]/secondary-emails`, { locale: $locale })}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<Mail class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">{$LL.secondaryEmail.title()}</p>
						<p class="text-sm text-muted-foreground">{$LL.secondaryEmail.manageDescription()}</p>
					</div>
				</a>

				<Button data-testid="sign-out-button" variant="outline" {...signOut.buttonProps}>
					{$LL.auth.signOut()}
				</Button>
			</form>
		</div>

		{#if data.user.isAdmin}
			<Separator class="hidden md:block" orientation="vertical" />
			<div class="flex w-full max-w-xs flex-col gap-4">
				<h2 class="font-mono text-lg">{$LL.admin.title()}</h2>
				<a
					href={route("/[locale=locale]/admin/memberships", { locale: $locale })}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<UserCog class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">{$LL.admin.memberships.title()}</p>
						<p class="text-sm text-muted-foreground">{$LL.admin.memberships.description()}</p>
					</div>
				</a>
				<a
					href={route("/[locale=locale]/admin/members", { locale: $locale })}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<UserCog class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">{$LL.admin.members.title()}</p>
						<p class="text-sm text-muted-foreground">{$LL.admin.members.description()}</p>
					</div>
				</a>
				<a
					href={route("/[locale=locale]/admin/members/import", { locale: $locale })}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<UserCog class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">{$LL.admin.import.title()}</p>
						<p class="text-sm text-muted-foreground">{$LL.admin.import.description()}</p>
					</div>
				</a>
				<a
					href={route("/[locale=locale]/admin/users", { locale: $locale })}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<UserCog class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">{$LL.admin.users.title()}</p>
						<p class="text-sm text-muted-foreground">{$LL.admin.users.description()}</p>
					</div>
				</a>
			</div>
		{/if}

		<Separator class="hidden md:block" orientation="vertical" />
		<div class="flex w-full max-w-xs flex-col gap-4">
			<h2 class="font-mono text-lg">{$LL.membership.title()}</h2>
			<a href={route("/[locale=locale]/new", { locale: $locale })} class="flex w-full max-w-xs flex-col">
				<Button variant="default">{$LL.membership.buy()}</Button>
			</a>
			{#if data.memberships.length === 0}
				<p class="text-sm text-muted-foreground">{$LL.membership.noMembership()}</p>
			{:else}
				{#each data.memberships as membership (membership.unique_id)}
					<li class="flex items-start space-x-4 rounded-md border p-4">
						<div class="flex min-w-0 flex-1 flex-col gap-2">
							<div class="flex items-center gap-2">
								{#if membership.status === "active"}
									<CircleCheck class="h-5 w-5 shrink-0" />
									<span class="text-sm font-medium">{$LL.membership.status.active()}</span>
								{:else if membership.status === "expired"}
									<Trash class="h-5 w-5 shrink-0" />
									<span class="text-sm font-medium">{$LL.membership.status.expired()}</span>
								{:else if membership.status === "awaiting_payment"}
									<Banknote class="h-5 w-5 shrink-0" />
									<span class="text-sm font-medium">{$LL.membership.status.awaitingPayment()}</span>
								{:else if membership.status === "awaiting_approval"}
									<Hourglass class="h-5 w-5 shrink-0" />
									<span class="text-sm font-medium">{$LL.membership.status.awaitingApproval()}</span>
								{:else}
									<CircleAlert class="h-5 w-5 shrink-0" />
									<span class="text-sm font-medium">{$LL.membership.status.unknown()}</span>
								{/if}
							</div>
							<div class="text-sm">
								<p class="font-medium">{membership.type}</p>
								<p>
									<time datetime={membership.startTime.toISOString()}
										>{membership.startTime.toLocaleDateString(`${$locale}-FI`)}</time
									>–<time datetime={membership.endTime.toISOString()}
										>{membership.endTime.toLocaleDateString(`${$locale}-FI`)}</time
									>
								</p>
							</div>
						</div>
					</li>
				{/each}
			{/if}
		</div>
	</div>
</main>
