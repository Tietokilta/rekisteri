<script lang="ts">
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import type { PageProps } from "./$types";
	import { Button } from "$lib/components/ui/button";
	import { Badge } from "$lib/components/ui/badge";
	import AdminPageHeader from "$lib/components/admin-page-header.svelte";
	import { getStripePriceMetadata } from "$lib/api/stripe.remote";
	import { formatDateRange, formatPrice, formatShortDateRange } from "$lib/utils";
	import * as Sheet from "$lib/components/ui/sheet";
	import * as Item from "$lib/components/ui/item";
	import * as Empty from "$lib/components/ui/empty";
	import Plus from "@lucide/svelte/icons/plus";
	import Users from "@lucide/svelte/icons/users";
	import Calendar from "@lucide/svelte/icons/calendar";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import Package from "@lucide/svelte/icons/package";
	import CreateMembershipForm from "./create-membership-form.svelte";
	import EditMembershipForm from "./edit-membership-form.svelte";

	const { data }: PageProps = $props();

	// State for creating membership
	let createSheetOpen = $state(false);

	// State for editing membership
	let editingMembership = $state<(typeof data.memberships)[number] | null>(null);
	let editSheetOpen = $state(false);

	function openEditSheet(membership: (typeof data.memberships)[number]) {
		editingMembership = membership;
		editSheetOpen = true;
	}

	// Helper to get membership type name for a membership
	function getMembershipTypeName(membershipTypeId: string, locale: string): string {
		const membershipType = data.membershipTypes.find((t) => t.id === membershipTypeId);
		if (!membershipType) return membershipTypeId;
		return locale === "fi" ? membershipType.name.fi : membershipType.name.en;
	}

	// Group memberships by start year and sort by type name within each group
	function groupByYear(memberships: typeof data.memberships) {
		const groups: Record<number, typeof data.memberships> = {};
		for (const membership of memberships) {
			const year = membership.startTime.getFullYear();
			if (!groups[year]) {
				groups[year] = [];
			}
			groups[year].push(membership);
		}
		// Sort years descending (newest first), and sort memberships by type name within each year
		return Object.entries(groups)
			.map(
				([year, items]) =>
					[
						Number(year),
						items.toSorted((a, b) =>
							getMembershipTypeName(a.membershipTypeId, $locale).localeCompare(
								getMembershipTypeName(b.membershipTypeId, $locale),
							),
						),
					] as const,
			)
			.toSorted((a, b) => b[0] - a[0]);
	}

	const membershipsByYear = $derived(groupByYear(data.memberships));
</script>

<main class="container mx-auto max-w-350 px-4 py-6">
	<AdminPageHeader title={$LL.admin.memberships.title()} description={$LL.admin.memberships.description()}>
		{#snippet actions()}
			<Button onclick={() => (createSheetOpen = true)}>
				<Plus class="size-4" />
				{$LL.membership.createNew()}
			</Button>
		{/snippet}
	</AdminPageHeader>

	{#if data.memberships.length === 0}
		<!-- Empty state -->
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon">
					<Package />
				</Empty.Media>
			</Empty.Header>
			<Empty.Title>{$LL.membership.noMembership()}</Empty.Title>
			<Empty.Content>
				<Button onclick={() => (createSheetOpen = true)}>
					<Plus class="size-4" />
					{$LL.membership.createNew()}
				</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<!-- Memberships grouped by year -->
		<div class="space-y-8">
			{#each membershipsByYear as [year, memberships] (year)}
				<section>
					<h2 class="mb-3 text-lg font-semibold text-muted-foreground">{year}–{year + 1}</h2>
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each memberships as membership (membership.id)}
							<Item.Root variant="outline" size="sm">
								{#snippet child({ props })}
									<button
										type="button"
										{...props}
										class="{props.class} transition-colors hover:bg-accent/50"
										onclick={() => openEditSheet(membership)}
									>
										<Item.Header>
											<span class="font-medium">{getMembershipTypeName(membership.membershipTypeId, $locale)}</span>
											{#if membership.stripePriceId}
												<svelte:boundary>
													{@const priceMetadata = await getStripePriceMetadata(membership.stripePriceId)}
													<span class="font-semibold">
														{formatPrice(priceMetadata.priceCents, priceMetadata.currency, $locale)}
													</span>
													{#snippet failed()}
														<span class="text-destructive">-</span>
													{/snippet}
												</svelte:boundary>
											{/if}
										</Item.Header>
										<Item.Content>
											<Item.Title class="font-normal text-muted-foreground">
												{#if membership.stripePriceId}
													<svelte:boundary>
														{@const priceMetadata = await getStripePriceMetadata(membership.stripePriceId)}
														{priceMetadata.productName ?? $LL.admin.memberships.legacyMembership()}
														{#snippet failed()}
															{$LL.admin.memberships.failedToLoadPrice()}
														{/snippet}
													</svelte:boundary>
												{:else}
													{$LL.admin.memberships.legacyMembership()}
												{/if}
											</Item.Title>
											<Item.Description class="flex items-center gap-3">
												<span class="flex items-center gap-1">
													<Calendar class="size-3.5" />
													{formatShortDateRange(membership.startTime, membership.endTime, $locale)}
												</span>
												<span class="flex items-center gap-1">
													<Users class="size-3.5" />
													{membership.memberCount}
												</span>
												{#if membership.requiresStudentVerification}
													<span title={$LL.membership.requiresStudentVerification()}>
														<GraduationCap class="size-3.5" />
													</span>
												{/if}
											</Item.Description>
										</Item.Content>
										{#if membership.stripePriceId}
											<svelte:boundary>
												{@const priceMetadata = await getStripePriceMetadata(membership.stripePriceId)}
												{#if !priceMetadata.active}
													<Item.Footer>
														<Badge variant="destructive" class="text-xs">{$LL.admin.memberships.priceInactive()}</Badge>
													</Item.Footer>
												{/if}
												{#snippet failed()}{/snippet}
											</svelte:boundary>
										{/if}
									</button>
								{/snippet}
							</Item.Root>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</main>

<!-- Create Membership Sheet -->
<Sheet.Root bind:open={createSheetOpen}>
	<Sheet.Content class="flex flex-col overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{$LL.membership.createNew()}</Sheet.Title>
			<Sheet.Description>{$LL.admin.memberships.description()}</Sheet.Description>
		</Sheet.Header>
		{#key createSheetOpen}
			{#if createSheetOpen}
				<CreateMembershipForm
					defaultValues={data.defaultValues}
					membershipTypes={data.membershipTypes}
					onClose={() => (createSheetOpen = false)}
				/>
			{/if}
		{/key}
	</Sheet.Content>
</Sheet.Root>

<!-- Edit Membership Sheet -->
<Sheet.Root bind:open={editSheetOpen}>
	<Sheet.Content class="flex flex-col overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{$LL.admin.memberships.editMembership()}</Sheet.Title>
			{#if editingMembership}
				<Sheet.Description class="flex items-center gap-2">
					<Calendar class="size-4" />
					{formatDateRange(editingMembership.startTime, editingMembership.endTime, $locale)}
				</Sheet.Description>
			{/if}
		</Sheet.Header>
		{#if editingMembership}
			{#key editingMembership.id}
				<EditMembershipForm
					membership={editingMembership}
					membershipTypes={data.membershipTypes}
					onClose={() => (editSheetOpen = false)}
				/>
			{/key}
		{/if}
	</Sheet.Content>
</Sheet.Root>
