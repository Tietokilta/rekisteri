<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { Separator } from "$lib/components/ui/separator";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import type { PageProps } from "./$types";
	import { createMembership, deleteMembership, updateMembership } from "./data.remote";
	import { createMembershipSchema, updateMembershipSchema } from "./schema";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import AdminPageHeader from "$lib/components/admin-page-header.svelte";
	import { getStripePriceMetadata } from "$lib/api/stripe.remote";
	import { formatPrice } from "$lib/utils";
	import * as Drawer from "$lib/components/ui/drawer";

	const { data }: PageProps = $props();

	// Initialize form with default values from server
	createMembership.fields.set(data.defaultValues);

	// State for editing membership
	let editingMembership = $state<(typeof data.memberships)[number] | null>(null);
	let editDrawerOpen = $state(false);

	function openEditDrawer(membership: (typeof data.memberships)[number]) {
		editingMembership = membership;
		updateMembership.fields.set({
			id: membership.id,
			type: membership.type,
			stripePriceId: membership.stripePriceId ?? "",
			requiresStudentVerification: membership.requiresStudentVerification,
		});
		editDrawerOpen = true;
	}

	// State for Stripe metadata (create form)
	let editStripeMetadata = $state<{
		priceId: string;
		priceCents: number;
		currency: string;
		nickname: string | null;
		productId: string;
		productName: string | null;
		active: boolean;
	} | null>(null);
	let fetchingEditMetadata = $state(false);
	let editMetadataError = $state<string | null>(null);

	// Fetch Stripe metadata when editing stripePriceId changes
	$effect(() => {
		if (!editDrawerOpen) return;

		const priceId = updateMembership.fields.stripePriceId.value();

		if (!priceId || !priceId.startsWith("price_")) {
			editStripeMetadata = null;
			editMetadataError = null;
			return;
		}

		// Debounce the fetch
		const timeoutId = setTimeout(async () => {
			fetchingEditMetadata = true;
			editMetadataError = null;

			try {
				const metadata = await getStripePriceMetadata(priceId);
				editStripeMetadata = metadata;
			} catch (err) {
				console.error("Failed to fetch Stripe metadata:", err);
				editMetadataError = "Failed to fetch price information";
				editStripeMetadata = null;
			} finally {
				fetchingEditMetadata = false;
			}
		}, 500);

		return () => clearTimeout(timeoutId);
	});

	// State for Stripe metadata
	let stripeMetadata = $state<{
		priceId: string;
		priceCents: number;
		currency: string;
		nickname: string | null;
		productId: string;
		productName: string | null;
		active: boolean;
	} | null>(null);
	let fetchingMetadata = $state(false);
	let metadataError = $state<string | null>(null);

	// Fetch Stripe metadata when stripePriceId changes
	$effect(() => {
		const priceId = createMembership.fields.stripePriceId.value();

		if (!priceId || !priceId.startsWith("price_")) {
			stripeMetadata = null;
			metadataError = null;
			return;
		}

		// Debounce the fetch
		const timeoutId = setTimeout(async () => {
			fetchingMetadata = true;
			metadataError = null;

			try {
				const metadata = await getStripePriceMetadata(priceId);
				stripeMetadata = metadata;
			} catch (err) {
				console.error("Failed to fetch Stripe metadata:", err);
				metadataError = "Failed to fetch price information";
				stripeMetadata = null;
			} finally {
				fetchingMetadata = false;
			}
		}, 500);

		return () => clearTimeout(timeoutId);
	});
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
	<AdminPageHeader title={$LL.admin.memberships.title()} />

	<div class="flex w-full max-w-2xl flex-col items-center gap-4 md:flex-row md:items-stretch">
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{$LL.membership.title()}</h2>
			<ul class="space-y-4">
				{#each data.memberships as membership (membership.id)}
					{@const deleteForm = deleteMembership.for(membership.id)}
					<li class="flex items-center justify-between space-x-4 rounded-md border p-4">
						<div class="text-sm">
							<p class="font-medium">{membership.type}</p>
							{#if membership.stripePriceId}
								<svelte:boundary>
									{@const priceMetadata = await getStripePriceMetadata(membership.stripePriceId)}
									{#if priceMetadata.productName}
										<p class="text-xs text-muted-foreground">{priceMetadata.productName}</p>
									{/if}
									<p>
										<time datetime={membership.startTime.toISOString()}
											>{membership.startTime.toLocaleDateString(`${$locale}-FI`)}</time
										>–<time datetime={membership.endTime.toISOString()}
											>{membership.endTime.toLocaleDateString(`${$locale}-FI`)}</time
										>
									</p>
									<p class="text-muted-foreground">
										{$LL.admin.memberships.stripePriceIdLabel({ stripePriceId: membership.stripePriceId })}
									</p>
									<p class="text-muted-foreground">
										{formatPrice(priceMetadata.priceCents, priceMetadata.currency, $locale)}
									</p>
									{#if !priceMetadata.active}
										<p class="text-xs text-destructive">{$LL.admin.memberships.priceInactive()}</p>
									{/if}
									{#snippet failed()}
										<p class="text-xs text-destructive">{$LL.admin.memberships.failedToLoadPrice()}</p>
									{/snippet}
								</svelte:boundary>
							{:else}
								<!-- Legacy membership without Stripe price -->
								<p>
									<time datetime={membership.startTime.toISOString()}
										>{membership.startTime.toLocaleDateString(`${$locale}-FI`)}</time
									>–<time datetime={membership.endTime.toISOString()}
										>{membership.endTime.toLocaleDateString(`${$locale}-FI`)}</time
									>
								</p>
								<p class="text-xs text-muted-foreground">{$LL.admin.memberships.legacyMembership()}</p>
							{/if}
							<p class="text-muted-foreground">{$LL.admin.members.count({ count: membership.memberCount })}</p>
						</div>
						<div class="flex flex-col gap-2">
							<Button variant="outline" size="sm" onclick={() => openEditDrawer(membership)}>
								{$LL.common.edit()}
							</Button>
							{#if membership.memberCount === 0}
								<form
									class="contents"
									{...deleteForm.enhance(async ({ submit }) => {
										await submit();
										await invalidateAll();
									})}
								>
									<input {...deleteForm.fields.id.as("hidden", membership.id)} />
									<Button type="submit" variant="destructive" size="sm" disabled={!!deleteForm.pending}>
										{$LL.common.delete()}
									</Button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
		<Separator class="hidden md:block" orientation="vertical" />
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{$LL.membership.createNew()}</h2>
			<form
				{...createMembership.preflight(createMembershipSchema).enhance(async ({ submit }) => {
					await submit();
					createMembership.fields.set(data.defaultValues);
					await invalidateAll();
				})}
				class="flex w-full max-w-xs flex-col gap-4"
			>
				<div class="space-y-2">
					<Label for="type">{$LL.membership.type()}</Label>
					<Input {...createMembership.fields.type.as("text")} id="type" list="types" />
					<p class="text-sm text-muted-foreground">{$LL.membership.continuityNote()}</p>
					<datalist id="types">
						{#each data.types as type (type)}
							<option value={type}></option>
						{/each}
					</datalist>
					{#each createMembership.fields.type.issues() as issue, i (i)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="space-y-2">
					<Label for="stripePriceId">{$LL.admin.memberships.stripePriceId()}</Label>
					<Input {...createMembership.fields.stripePriceId.as("text")} id="stripePriceId" placeholder="price_xxx" />
					<p class="text-sm text-muted-foreground">{$LL.admin.memberships.stripePriceIdDescription()}</p>

					{#if fetchingMetadata}
						<div class="mt-2 text-sm text-muted-foreground">
							{$LL.admin.memberships.fetchingStripeMetadata()}
						</div>
					{:else if metadataError}
						<div class="mt-2 text-sm text-destructive">
							{metadataError}
						</div>
					{:else if stripeMetadata}
						<div class="mt-2 space-y-1 rounded-md border bg-muted/50 p-2 text-sm">
							<p class="font-medium text-foreground">
								{$LL.admin.memberships.stripeMetadataPreview()}
							</p>
							{#if stripeMetadata.productName}
								<p class="text-muted-foreground">
									{$LL.admin.memberships.productName()}:
									<span class="text-foreground">{stripeMetadata.productName}</span>
								</p>
							{/if}
							{#if stripeMetadata.nickname}
								<p class="text-muted-foreground">
									{$LL.admin.memberships.priceNickname()}:
									<span class="text-foreground">{stripeMetadata.nickname}</span>
								</p>
							{/if}
							<p class="text-muted-foreground">
								{$LL.admin.memberships.amount()}:
								<span class="text-foreground"
									>{formatPrice(stripeMetadata.priceCents, stripeMetadata.currency, $locale)}</span
								>
							</p>
							{#if !stripeMetadata.active}
								<p class="text-destructive">
									{$LL.admin.memberships.priceInactive()}
								</p>
							{/if}
						</div>
					{/if}

					{#each createMembership.fields.stripePriceId.issues() as issue, i (i)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="space-y-2">
					<Label for="startTime">{$LL.membership.startTime()}</Label>
					<Input {...createMembership.fields.startTime.as("date")} id="startTime" />
					{#each createMembership.fields.startTime.issues() as issue, i (i)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="space-y-2">
					<Label for="endTime">{$LL.membership.endTime()}</Label>
					<Input {...createMembership.fields.endTime.as("date")} id="endTime" />
					{#each createMembership.fields.endTime.issues() as issue, i (i)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="flex items-center gap-2">
					<Input
						{...createMembership.fields.requiresStudentVerification.as("checkbox")}
						id="requiresStudentVerification"
						class="w-auto"
					/>
					<Label for="requiresStudentVerification">{$LL.membership.requiresStudentVerification()}</Label>
				</div>

				<Button type="submit">{$LL.membership.add()}</Button>
			</form>
		</div>
	</div>
</main>

<!-- Edit Membership Drawer -->
<Drawer.Root bind:open={editDrawerOpen}>
	<Drawer.Content>
		<Drawer.Header>
			<Drawer.Title>{$LL.admin.memberships.editMembership()}</Drawer.Title>
			{#if editingMembership}
				<Drawer.Description>
					{editingMembership.startTime.toLocaleDateString(
						`${$locale}-FI`,
					)}–{editingMembership.endTime.toLocaleDateString(`${$locale}-FI`)}
				</Drawer.Description>
			{/if}
		</Drawer.Header>
		<div class="p-4">
			{#if editingMembership}
				{@const editForm = updateMembership.for(editingMembership.id)}
				<form
					{...editForm.preflight(updateMembershipSchema).enhance(async ({ submit }) => {
						await submit();
						editDrawerOpen = false;
						await invalidateAll();
					})}
					class="flex flex-col gap-4"
				>
					<input {...editForm.fields.id.as("hidden", editingMembership.id)} />

					<div class="space-y-2">
						<Label for="edit-type">{$LL.membership.type()}</Label>
						<Input {...editForm.fields.type.as("text")} id="edit-type" list="edit-types" />
						<p class="text-sm text-muted-foreground">{$LL.membership.continuityNote()}</p>
						<datalist id="edit-types">
							{#each data.types as type (type)}
								<option value={type}></option>
							{/each}
						</datalist>
						{#each editForm.fields.type.issues() as issue, i (i)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>

					<div class="space-y-2">
						<Label for="edit-stripePriceId">{$LL.admin.memberships.stripePriceId()}</Label>
						<Input {...editForm.fields.stripePriceId.as("text")} id="edit-stripePriceId" placeholder="price_xxx" />
						<p class="text-sm text-muted-foreground">{$LL.admin.memberships.stripePriceIdDescription()}</p>

						{#if fetchingEditMetadata}
							<div class="mt-2 text-sm text-muted-foreground">
								{$LL.admin.memberships.fetchingStripeMetadata()}
							</div>
						{:else if editMetadataError}
							<div class="mt-2 text-sm text-destructive">
								{editMetadataError}
							</div>
						{:else if editStripeMetadata}
							<div class="mt-2 space-y-1 rounded-md border bg-muted/50 p-2 text-sm">
								<p class="font-medium text-foreground">
									{$LL.admin.memberships.stripeMetadataPreview()}
								</p>
								{#if editStripeMetadata.productName}
									<p class="text-muted-foreground">
										{$LL.admin.memberships.productName()}:
										<span class="text-foreground">{editStripeMetadata.productName}</span>
									</p>
								{/if}
								{#if editStripeMetadata.nickname}
									<p class="text-muted-foreground">
										{$LL.admin.memberships.priceNickname()}:
										<span class="text-foreground">{editStripeMetadata.nickname}</span>
									</p>
								{/if}
								<p class="text-muted-foreground">
									{$LL.admin.memberships.amount()}:
									<span class="text-foreground"
										>{formatPrice(editStripeMetadata.priceCents, editStripeMetadata.currency, $locale)}</span
									>
								</p>
								{#if !editStripeMetadata.active}
									<p class="text-destructive">
										{$LL.admin.memberships.priceInactive()}
									</p>
								{/if}
							</div>
						{/if}

						{#each editForm.fields.stripePriceId.issues() as issue, i (i)}
							<p class="text-sm text-destructive">{issue.message}</p>
						{/each}
					</div>

					<div class="flex items-center gap-2">
						<Input
							{...editForm.fields.requiresStudentVerification.as("checkbox")}
							id="edit-requiresStudentVerification"
							class="w-auto"
						/>
						<Label for="edit-requiresStudentVerification">{$LL.membership.requiresStudentVerification()}</Label>
					</div>

					<Drawer.Footer class="px-0">
						<Button type="submit" disabled={!!editForm.pending}>{$LL.common.save()}</Button>
						<Drawer.Close>
							<Button variant="outline" class="w-full">{$LL.common.cancel()}</Button>
						</Drawer.Close>
					</Drawer.Footer>
				</form>
			{/if}
		</div>
	</Drawer.Content>
</Drawer.Root>
