<script lang="ts">
	import type { PageProps } from "./$types";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { route } from "$lib/ROUTES";
	import * as Alert from "$lib/components/ui/alert/index.js";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import CircleAlert from "@lucide/svelte/icons/circle-alert";
	import { payMembership } from "./data.remote";
	import { payMembershipSchema } from "./schema";

	const { data }: PageProps = $props();

	const { memberships, availableMemberships } = data;
	const filteredMemberships = availableMemberships.filter((a) => !memberships.some((b) => a.id === b.id));

	let isStudent = $state(false);
	let requireStudentVerification = $derived(
		availableMemberships.find((e) => e.id === payMembership.fields.membershipId.value())?.requiresStudentVerification ??
			false,
	);
	let disableForm = $derived(!isStudent && requireStudentVerification);
</script>

<main class="my-4 flex flex-col items-center justify-center">
	<h1 class="font-mono text-lg">{$LL.membership.buy()}</h1>
	<form {...payMembership.preflight(payMembershipSchema)} class="flex w-full max-w-xs flex-col gap-4">
		<div class="space-y flex flex-col gap-1 rounded-lg border p-4">
			<div class="space-y-2">
				<Label>{$LL.membership.select()}</Label>
				{#each filteredMemberships as membership (membership.id)}
					<label class="flex items-start gap-3 rounded-lg border p-4 focus-within:border-primary hover:border-primary">
						<input {...payMembership.fields.membershipId.as("radio", membership.id)} required />
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
			</div>

			{#if requireStudentVerification}
				<div class="mt-4 space-y-3">
					<div class="rounded-lg border p-4">
						<label class="flex items-start gap-3">
							<input type="checkbox" name="isStudent" bind:checked={isStudent} required class="rounded" />
							<span class="text-sm">{$LL.membership.isStudent()}</span>
						</label>
					</div>

					{#if data.hasValidAaltoEmail}
						<Alert.Root variant="default" class="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
							<CircleCheck class="h-4 w-4 text-green-600 dark:text-green-400" />
							<Alert.Description class="text-green-800 dark:text-green-200">
								{$LL.secondaryEmail.verifiedDomainEmail()}
								{#if data.aaltoEmailExpiry}
									({$LL.secondaryEmail.expiresOn({
										date: new Date(data.aaltoEmailExpiry).toLocaleDateString(`${$locale}-FI`),
									})})
								{/if}
							</Alert.Description>
						</Alert.Root>
					{:else if data.hasExpiredAaltoEmail}
						<Alert.Root variant="destructive">
							<CircleAlert class="h-4 w-4" />
							<Alert.Description>
								{$LL.secondaryEmail.expiredMessage()}
								<a
									href={route("/[locale=locale]/secondary-emails", { locale: $locale })}
									class="ml-1 font-medium underline"
								>
									{$LL.secondaryEmail.reverifyNow()}
								</a>
							</Alert.Description>
						</Alert.Root>
					{:else}
						<Alert.Root variant="destructive">
							<CircleAlert class="h-4 w-4" />
							<Alert.Description>
								{$LL.secondaryEmail.notVerifiedMessage()}
								<a
									href={route("/[locale=locale]/secondary-emails", { locale: $locale })}
									class="ml-1 font-medium underline"
								>
									{$LL.secondaryEmail.addDomainEmail({ domain: "aalto.fi" })}
								</a>
							</Alert.Description>
						</Alert.Root>
					{/if}
				</div>
			{/if}
		</div>

		<Button type="submit" disabled={disableForm} class={disableForm ? "cursor-not-allowed opacity-50" : ""}>
			{$LL.membership.buy()}
			{#if payMembership.fields.membershipId.value()}
				({(availableMemberships.find((x) => x.id === payMembership.fields.membershipId.value())?.priceCents ?? 0) / 100} €)
			{/if}
		</Button>
	</form>
</main>
