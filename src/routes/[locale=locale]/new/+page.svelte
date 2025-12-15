<script lang="ts">
	import type { PageProps } from "./$types";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { superForm } from "sveltekit-superforms";
	import { schema } from "./schema";
	import { route } from "$lib/ROUTES";
	import * as Form from "$lib/components/ui/form/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { Separator } from "$lib/components/ui/separator";
	import { Button } from "$lib/components/ui/button";
	import PackageX from "@lucide/svelte/icons/package-x";

	const { data }: PageProps = $props();

	const form = superForm(data.form, {
		validators: zod4Client(schema),
	});
	const { form: formData, enhance } = form;

	const { availableMemberships, latestMembership } = data;

	// Pre-select first available membership
	$effect(() => {
		const firstMembership = availableMemberships?.[0];
		if (firstMembership && !$formData.membershipId) {
			$formData.membershipId = firstMembership.id;
		}
	});

	let isStudent = $state(false);

	// Get currently selected membership
	const selectedMembership = $derived(availableMemberships.find((m) => m.id === $formData.membershipId));

	const requireStudentVerification = $derived(selectedMembership?.requiresStudentVerification ?? false);
	const disableForm = $derived(!isStudent && requireStudentVerification);
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">{$LL.membership.buy()}</h1>

	{#if availableMemberships.length === 0}
		<!-- Empty State -->
		<Empty.Root class="my-12">
			<Empty.Media>
				<PackageX class="h-16 w-16 text-muted-foreground" />
			</Empty.Media>
			<Empty.Title>{$LL.membership.noAvailable()}</Empty.Title>
			<Empty.Description>{$LL.membership.noAvailableDescription()}</Empty.Description>
			<Button href={route("/[locale=locale]", { locale: $locale })} class="mt-4">
				{$LL.common.backToHome()}
			</Button>
		</Empty.Root>
	{:else}
		<!-- Two Column Layout -->
		<div class="flex w-full max-w-2xl flex-col items-start gap-4 md:flex-row md:items-stretch">
			<!-- Left Column: Membership Selection -->
			<div class="w-full max-w-xs">
				<form
					method="post"
					action={route("payMembership /[locale=locale]/new", { locale: $locale })}
					use:enhance
					class="flex flex-col gap-4"
				>
					<!-- Membership Type Selection -->
					<div class="flex flex-col gap-2">
						<Form.Field {form} name="membershipId">
							<Form.Control>
								<Form.Label class="mb-2">{$LL.membership.select()}</Form.Label>
								{#each availableMemberships as membership (membership.id)}
									<label
										class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:border-primary data-[selected=true]:border-primary data-[selected=true]:bg-accent"
										data-selected={$formData.membershipId === membership.id}
									>
										<input
											type="radio"
											name="membershipId"
											value={membership.id}
											bind:group={$formData.membershipId}
											required
											class="mt-0.5"
										/>
										<div class="flex flex-1 flex-col">
											<span class="text-sm font-medium">
												{$locale === "fi" ? membership.membershipType.nameFi : membership.membershipType.nameEn}
											</span>
											<span class="text-xs text-muted-foreground">
												{new Date(membership.startTime).toLocaleDateString(`${$locale}-FI`)}
												– {new Date(membership.endTime).toLocaleDateString(`${$locale}-FI`)}
											</span>
											<span class="mt-1 text-sm font-semibold">
												{membership.priceCents / 100} €
											</span>
										</div>
									</label>
								{/each}
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>

					<!-- Student Verification -->
					{#if requireStudentVerification}
						<div class="rounded-lg border border-primary/50 bg-primary/5 p-3">
							<label class="flex cursor-pointer items-start gap-3">
								<input type="checkbox" name="isStudent" bind:checked={isStudent} required class="mt-0.5 rounded" />
								<span class="text-sm">{$LL.membership.isStudent()}</span>
							</label>
						</div>
					{/if}

					<!-- Buy Button -->
					<Form.Button
						type="submit"
						disabled={disableForm}
						class="w-full {disableForm ? 'cursor-not-allowed opacity-50' : ''}"
					>
						{$LL.membership.buy()}
						{#if selectedMembership}
							({selectedMembership.priceCents / 100} €)
						{/if}
					</Form.Button>
				</form>
			</div>

			<Separator class="hidden md:block" orientation="vertical" />

			<!-- Right Column: Details -->
			<div class="w-full max-w-xs">
				{#if selectedMembership}
					<div class="flex flex-col gap-4">
						<div>
							<h2 class="mb-2 font-mono text-lg">
								{$locale === "fi" ? selectedMembership.membershipType.nameFi : selectedMembership.membershipType.nameEn}
							</h2>
							{#if selectedMembership.membershipType.descriptionFi || selectedMembership.membershipType.descriptionEn}
								<p class="text-sm text-muted-foreground">
									{$locale === "fi"
										? selectedMembership.membershipType.descriptionFi
										: selectedMembership.membershipType.descriptionEn}
								</p>
							{/if}
						</div>

						<div class="rounded-lg border p-3">
							<dl class="space-y-2 text-sm">
								<div>
									<dt class="font-medium">{$LL.membership.period()}</dt>
									<dd class="text-muted-foreground">
										{new Date(selectedMembership.startTime).toLocaleDateString(`${$locale}-FI`)}
										– {new Date(selectedMembership.endTime).toLocaleDateString(`${$locale}-FI`)}
									</dd>
								</div>
								<div>
									<dt class="font-medium">{$LL.membership.price({ price: selectedMembership.priceCents / 100 })}</dt>
								</div>
								{#if selectedMembership.requiresStudentVerification}
									<div>
										<dt class="font-medium">{$LL.membership.requirements()}</dt>
										<dd class="text-muted-foreground">{$LL.membership.requiresStudentVerification()}</dd>
									</div>
								{/if}
							</dl>
						</div>

						<!-- Previous Membership Reminder -->
						{#if latestMembership}
							<div class="rounded-lg border border-muted bg-muted/50 p-3">
								<p class="mb-1 text-xs font-medium text-muted-foreground uppercase">
									{$LL.membership.previousMembership()}
								</p>
								<p class="text-sm">
									{$locale === "fi" ? latestMembership.membershipType.nameFi : latestMembership.membershipType.nameEn}
								</p>
								<p class="text-xs text-muted-foreground">
									{new Date(latestMembership.startTime).toLocaleDateString(`${$locale}-FI`)}
									– {new Date(latestMembership.endTime).toLocaleDateString(`${$locale}-FI`)}
								</p>
								<p class="mt-1 text-xs text-muted-foreground">
									{$LL.membership.status.label()}: {#if latestMembership.status === "active"}
										{$LL.membership.status.active()}
									{:else if latestMembership.status === "expired"}
										{$LL.membership.status.expired()}
									{:else if latestMembership.status === "awaiting_payment"}
										{$LL.membership.status.awaitingPayment()}
									{:else if latestMembership.status === "awaiting_approval"}
										{$LL.membership.status.awaitingApproval()}
									{:else if latestMembership.status === "cancelled"}
										{$LL.membership.status.cancelled()}
									{/if}
								</p>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</main>
