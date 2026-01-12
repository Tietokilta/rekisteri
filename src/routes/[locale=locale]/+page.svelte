<script lang="ts">
	import { Input } from "$lib/components/ui/input/index.js";
	import type { PageData } from "./$types";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { Switch } from "$lib/components/ui/switch";
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
	import { saveUserInfo, signOut } from "./data.remote";

	let { data }: { data: PageData } = $props();

	// Use remote functions for form handling
	const form = saveUserInfo;
	const signOutForm = signOut;

	// Configure Zod locale based on current language
	$effect(() => {
		z.config($locale === "fi" ? fi() : en());
	});

	// Show toast on form submission
	$effect(() => {
		if (form.result && "success" in form.result && form.result.success) {
			toast.success($LL.user.saveSuccess());
		} else if (form.result && "success" in form.result && !form.result.success) {
			toast.error($LL.user.saveError());
		}
	});
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">
		{$LL.user.welcome({ firstNames: data.user.firstNames ?? "", lastName: data.user.lastName ?? "" })}
	</h1>

	<PasskeyRegistrationBanner user={data.user} />

	<div class="flex w-full max-w-2xl flex-col items-center gap-4 md:flex-row md:items-stretch">
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{$LL.user.editInfo()}</h2>

			<form {...form} class="flex w-full max-w-xs flex-col gap-4">
				<div>
					<label for="email" class="text-sm leading-none font-medium">{$LL.user.email()}</label>
					<Input
						id="email"
						type="email"
						autocomplete="email"
						autocapitalize="none"
						autocorrect="off"
						readonly
						value={data.user.email}
					/>
				</div>

				<div>
					<label for="firstNames" class="text-sm leading-none font-medium">{$LL.user.firstNames()}</label>
					<Input {...form.fields.firstNames.as("text")} autocomplete="given-name" />
				</div>

				<div>
					<label for="lastName" class="text-sm leading-none font-medium">{$LL.user.lastName()}</label>
					<Input {...form.fields.lastName.as("text")} autocomplete="family-name" />
				</div>

				<div>
					<label for="homeMunicipality" class="text-sm leading-none font-medium">{$LL.user.homeMunicipality()}</label>
					<Input {...form.fields.homeMunicipality.as("text")} autocomplete="address-level2" />
				</div>

				<div>
					<label for="preferredLanguage" class="text-sm leading-none font-medium">{$LL.user.preferredLanguage()}</label>
					<p class="text-sm text-muted-foreground">{$LL.user.preferredLanguageDescription()}</p>
					<select
						{...form.fields.preferredLanguage.as("select")}
						autocomplete="language"
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="unspecified">{$LL.user.preferredLanguageOptions.unspecified()}</option>
						<option value="finnish">{$LL.user.preferredLanguageOptions.finnish()}</option>
						<option value="english">{$LL.user.preferredLanguageOptions.english()}</option>
					</select>
				</div>

				<div class="flex flex-row items-center justify-between rounded-lg border p-4">
					<div class="space-y-0.5">
						<label for="isAllowedEmails" class="text-sm leading-none font-medium">{$LL.user.allowEmails()}</label>
						<p class="text-sm text-muted-foreground">{$LL.user.allowEmailsDescription()}</p>
					</div>
					<Switch
						name={form.fields.isAllowedEmails.as("checkbox").name}
						checked={form.fields.isAllowedEmails.as("checkbox").checked}
					/>
				</div>

				<button
					type="submit"
					class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
				>
					{$LL.common.save()}
				</button>

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

				<button
					{...signOutForm.buttonProps}
					data-testid="sign-out-button"
					class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
				>
					{$LL.auth.signOut()}
				</button>
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
			<a
				href={route("/[locale=locale]/new", { locale: $locale })}
				class="inline-flex h-10 w-full max-w-xs items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
			>
				{$LL.membership.buy()}
			</a>
			{#if data.memberships.length === 0}
				<p class="text-sm text-muted-foreground">{$LL.membership.noMembership()}</p>
			{:else}
				{#each data.memberships as membership (membership.unique_id)}
					<li class="flex items-start space-x-4 rounded-md border p-4">
						<div class="flex min-w-0 flex-1 flex-col gap-2">
							<div class="flex items-center gap-2">
								{#if membership.status === "active"}
									<CircleCheck class="h-5 w-5 flex-shrink-0" />
									<span class="text-sm font-medium">{$LL.membership.status.active()}</span>
								{:else if membership.status === "expired"}
									<Trash class="h-5 w-5 flex-shrink-0" />
									<span class="text-sm font-medium">{$LL.membership.status.expired()}</span>
								{:else if membership.status === "awaiting_payment"}
									<Banknote class="h-5 w-5 flex-shrink-0" />
									<span class="text-sm font-medium">{$LL.membership.status.awaitingPayment()}</span>
								{:else if membership.status === "awaiting_approval"}
									<Hourglass class="h-5 w-5 flex-shrink-0" />
									<span class="text-sm font-medium">{$LL.membership.status.awaitingApproval()}</span>
								{:else}
									<CircleAlert class="h-5 w-5 flex-shrink-0" />
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
