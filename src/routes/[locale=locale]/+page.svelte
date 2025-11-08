<script lang="ts">
	import { Input } from "$lib/components/ui/input/index.js";
	import type { PageServerData } from "./$types";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { Switch } from "$lib/components/ui/switch";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { superForm } from "sveltekit-superforms";
	import { schema } from "./schema";
	import * as Form from "$lib/components/ui/form/index.js";
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

	let { data }: { data: PageServerData } = $props();

	// Configure Zod locale based on current language
	$effect(() => {
		z.config($locale === "fi" ? fi() : en());
	});

	const form = superForm(data.form, {
		validators: zod4Client(schema),
		validationMethod: "oninput",
		onResult({ result }) {
			if (result.type === "success" && result.data?.success) {
				toast.success($LL.user.saveSuccess());
			} else if (result.type === "failure") {
				toast.error($LL.user.saveError());
			}
		},
	});
	const { form: formData, enhance } = form;
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">
		{$LL.user.welcome({ firstNames: data.user.firstNames ?? "", lastName: data.user.lastName ?? "" })}
	</h1>

	<div class="flex w-full max-w-2xl flex-col items-center gap-4 md:flex-row md:items-stretch">
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{$LL.user.editInfo()}</h2>

			<form
				method="post"
				action={route("saveInfo /[locale=locale]", { locale: $locale })}
				use:enhance
				class="flex w-full max-w-xs flex-col gap-4"
			>
				<Form.Field {form} name="email">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.user.email()}</Form.Label>
							<Input
								{...props}
								type="email"
								autocomplete="email"
								autocapitalize="none"
								autocorrect="off"
								readonly
								bind:value={$formData.email}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="firstNames">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.user.firstNames()}</Form.Label>
							<Input {...props} autocomplete="given-name" bind:value={$formData.firstNames} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="lastName">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.user.lastName()}</Form.Label>
							<Input {...props} autocomplete="family-name" bind:value={$formData.lastName} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="homeMunicipality">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.user.homeMunicipality()}</Form.Label>
							<Input {...props} autocomplete="address-level2" bind:value={$formData.homeMunicipality} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="preferredLanguage">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.user.preferredLanguage()}</Form.Label>
							<Form.Description>{$LL.user.preferredLanguageDescription()}</Form.Description>
							<select
								{...props}
								bind:value={$formData.preferredLanguage}
								autocomplete="language"
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							>
								<option value="unspecified">{$LL.user.preferredLanguageOptions.unspecified()}</option>
								<option value="finnish">{$LL.user.preferredLanguageOptions.finnish()}</option>
								<option value="english">{$LL.user.preferredLanguageOptions.english()}</option>
							</select>
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
								<Form.Label>{$LL.user.allowEmails()}</Form.Label>
								<Form.Description>{$LL.user.allowEmailsDescription()}</Form.Description>
							</div>
							<Switch {...props} bind:checked={$formData.isAllowedEmails} />
						{/snippet}
					</Form.Control>
				</Form.Field>

				<Form.Button type="submit">{$LL.common.save()}</Form.Button>

				<Form.Button
					formnovalidate
					formmethod="post"
					formaction={route("signOut /[locale=locale]", { locale: $locale })}
					variant="outline">{$LL.auth.signOut()}</Form.Button
				>
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
			</div>
		{/if}

		<Separator class="hidden md:block" orientation="vertical" />
		<div class="flex w-full max-w-xs flex-col gap-4">
			<h2 class="font-mono text-lg">{$LL.membership.title()}</h2>
			<a href={route("/[locale=locale]/new", { locale: $locale })} class="flex w-full max-w-xs flex-col">
				<Form.Button variant="default">{$LL.membership.buy()}</Form.Button>
			</a>
			{#if data.memberships.length === 0}
				<p class="text-sm text-muted-foreground">{$LL.membership.noMembership()}</p>
			{:else}
				{#each data.memberships as membership (membership.unique_id)}
					<li class="flex items-center justify-between space-x-4 rounded-md border p-4">
						{#if membership.status === "active"}
							<span title={$LL.membership.status.active()}>
								<CircleCheck class="h-6 w-6" />
							</span>
						{:else if membership.status === "expired"}
							<span title={$LL.membership.status.expired()}>
								<Trash class="h-6 w-6" />
							</span>
						{:else if membership.status === "awaiting_payment"}
							<span title={$LL.membership.status.awaitingPayment()}>
								<Banknote class="h-6 w-6" />
							</span>
						{:else if membership.status === "awaiting_approval"}
							<span title={$LL.membership.status.awaitingApproval()}>
								<Hourglass class="h-6 w-6" />
							</span>
						{:else}
							<span title={$LL.membership.status.unknown()}>
								<CircleAlert class="h-6 w-6" />
							</span>
						{/if}
						<div class="flex-1 space-y-1">
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
