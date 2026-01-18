<script lang="ts">
	import { untrack } from "svelte";
	import { invalidateAll } from "$app/navigation";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { updateMembership, deleteMembership } from "./data.remote";
	import { updateMembershipSchema, deleteMembershipSchema } from "./schema";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import { Badge } from "$lib/components/ui/badge";
	import { getStripePriceMetadata } from "$lib/api/stripe.remote";
	import { formatPrice } from "$lib/utils";
	import * as Sheet from "$lib/components/ui/sheet";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";

	interface Membership {
		id: string;
		type: string;
		stripePriceId: string | null;
		startTime: Date;
		endTime: Date;
		requiresStudentVerification: boolean;
		memberCount: number;
	}

	interface Props {
		membership: Membership;
		types: Set<string>;
		onClose: () => void;
	}

	let { membership, types, onClose }: Props = $props();

	const editForm = updateMembership.for(membership.id);

	// Initialize form fields when component mounts
	$effect(() => {
		untrack(() => {
			editForm.fields.set({
				id: membership.id,
				type: membership.type,
				stripePriceId: membership.stripePriceId ?? "",
				requiresStudentVerification: membership.requiresStudentVerification,
			});
		});
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
		const priceId = editForm.fields.stripePriceId.value();

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

<form
	{...editForm.preflight(updateMembershipSchema).enhance(async ({ submit }) => {
		await submit();
		onClose();
		await invalidateAll();
	})}
	class="flex flex-1 flex-col gap-5 px-4"
>
	<input {...editForm.fields.id.as("hidden", membership.id)} />

	<!-- Type field -->
	<div class="space-y-2">
		<Label for="edit-type">{$LL.membership.type()}</Label>
		<Input {...editForm.fields.type.as("text")} id="edit-type" list="edit-types" />
		<p class="text-sm text-muted-foreground">{$LL.membership.continuityNote()}</p>
		<datalist id="edit-types">
			{#each types as type (type)}
				<option value={type}></option>
			{/each}
		</datalist>
		{#each editForm.fields.type.issues() as issue, i (i)}
			<p class="text-sm text-destructive">{issue.message}</p>
		{/each}
	</div>

	<!-- Stripe Price ID -->
	<div class="space-y-2">
		<Label for="edit-stripePriceId">{$LL.admin.memberships.stripePriceId()}</Label>
		<Input
			{...editForm.fields.stripePriceId.as("text")}
			id="edit-stripePriceId"
			placeholder="price_xxx"
			class="font-mono"
		/>
		<p class="text-sm text-muted-foreground">{$LL.admin.memberships.stripePriceIdDescription()}</p>

		{#if fetchingMetadata}
			<div
				class="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
			>
				<div class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
				{$LL.admin.memberships.fetchingStripeMetadata()}
			</div>
		{:else if metadataError}
			<div class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
				{metadataError}
			</div>
		{:else if stripeMetadata}
			<div class="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
				<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{$LL.admin.memberships.stripeMetadataPreview()}
				</p>
				<div class="space-y-1 text-sm">
					{#if stripeMetadata.productName}
						<div class="flex justify-between">
							<span class="text-muted-foreground">{$LL.admin.memberships.productName()}</span>
							<span class="font-medium">{stripeMetadata.productName}</span>
						</div>
					{/if}
					{#if stripeMetadata.nickname}
						<div class="flex justify-between">
							<span class="text-muted-foreground">{$LL.admin.memberships.priceNickname()}</span>
							<span class="font-medium">{stripeMetadata.nickname}</span>
						</div>
					{/if}
					<div class="flex justify-between">
						<span class="text-muted-foreground">{$LL.admin.memberships.amount()}</span>
						<span class="font-semibold">{formatPrice(stripeMetadata.priceCents, stripeMetadata.currency, $locale)}</span
						>
					</div>
					{#if !stripeMetadata.active}
						<div class="mt-2 flex items-center gap-2 text-destructive">
							<Badge variant="destructive">{$LL.admin.memberships.priceInactive()}</Badge>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#each editForm.fields.stripePriceId.issues() as issue, i (i)}
			<p class="text-sm text-destructive">{issue.message}</p>
		{/each}
	</div>

	<!-- Student verification checkbox -->
	<label
		class="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
	>
		<Input
			{...editForm.fields.requiresStudentVerification.as("checkbox")}
			id="edit-requiresStudentVerification"
			class="size-5"
		/>
		<div class="flex-1">
			<p class="font-medium">{$LL.membership.requiresStudentVerification()}</p>
			<p class="text-sm text-muted-foreground">
				{$LL.membership.isStudent()}
			</p>
		</div>
		<GraduationCap class="size-5 text-muted-foreground" />
	</label>

	<Sheet.Footer class="flex-col gap-3">
		<div class="flex w-full gap-3">
			<Button type="button" variant="outline" class="flex-1" onclick={onClose}>
				{$LL.common.cancel()}
			</Button>
			<Button type="submit" disabled={!!editForm.pending} class="flex-1">{$LL.common.save()}</Button>
		</div>
	</Sheet.Footer>
</form>

{#if membership.memberCount === 0}
	{@const deleteForm = deleteMembership.for(membership.id)}
	<form
		{...deleteForm.preflight(deleteMembershipSchema).enhance(async ({ submit }) => {
			await submit();
			onClose();
			await invalidateAll();
		})}
		class="px-4 pb-4"
	>
		<input {...deleteForm.fields.id.as("hidden", membership.id)} />
		<Button type="submit" variant="destructive" class="w-full">
			<Trash2 class="size-4" />
			{$LL.common.delete()}
		</Button>
	</form>
{/if}
