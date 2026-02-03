<script lang="ts">
	import { untrack } from "svelte";
	import { invalidateAll } from "$app/navigation";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { createMembership } from "./data.remote";
	import { createMembershipSchema } from "./schema";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import { Badge } from "$lib/components/ui/badge";
	import { getStripePriceMetadata } from "$lib/api/stripe.remote";
	import { formatPrice } from "$lib/utils";
	import * as Sheet from "$lib/components/ui/sheet";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import type { MembershipType } from "$lib/server/db/schema";

	interface DefaultValues {
		membershipTypeId: string;
		stripePriceId: string;
		startTime: string;
		endTime: string;
		requiresStudentVerification: boolean;
	}

	interface Props {
		defaultValues: DefaultValues;
		membershipTypes: MembershipType[];
		onClose: () => void;
	}

	let { defaultValues, membershipTypes, onClose }: Props = $props();

	// Initialize form fields when component mounts
	$effect(() => {
		untrack(() => {
			createMembership.fields.set(defaultValues);
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

<form
	{...createMembership.preflight(createMembershipSchema).enhance(async ({ submit }) => {
		await submit();
		onClose();
		await invalidateAll();
	})}
	class="flex flex-1 flex-col gap-5 px-4"
>
	<!-- Membership Type -->
	<div class="space-y-2">
		<Label for="membershipTypeId">{$LL.membership.type()}</Label>
		<select
			{...createMembership.fields.membershipTypeId.as("select")}
			id="membershipTypeId"
			class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		>
			<option value="">{$LL.common.select()}</option>
			{#each membershipTypes as membershipType (membershipType.id)}
				<option value={membershipType.id}>
					{$locale === "fi" ? membershipType.name.fi : membershipType.name.en}
				</option>
			{/each}
		</select>
		<p class="text-sm text-muted-foreground">{$LL.membership.continuityNote()}</p>
		{#each createMembership.fields.membershipTypeId.issues() as issue, i (i)}
			<p class="text-sm text-destructive">{issue.message}</p>
		{/each}
	</div>

	<!-- Stripe Price ID -->
	<div class="space-y-2">
		<Label for="stripePriceId">{$LL.admin.memberships.stripePriceId()}</Label>
		<Input
			{...createMembership.fields.stripePriceId.as("text")}
			id="stripePriceId"
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

		{#each createMembership.fields.stripePriceId.issues() as issue, i (i)}
			<p class="text-sm text-destructive">{issue.message}</p>
		{/each}
	</div>

	<!-- Date range -->
	<div class="grid grid-cols-2 gap-4">
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
	</div>

	<!-- Student verification checkbox -->
	<label
		class="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
	>
		<Input
			{...createMembership.fields.requiresStudentVerification.as("checkbox")}
			id="requiresStudentVerification"
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

	<Sheet.Footer>
		<Button type="button" variant="outline" class="flex-1" onclick={onClose}>
			{$LL.common.cancel()}
		</Button>
		<Button type="submit" class="flex-1">{$LL.membership.add()}</Button>
	</Sheet.Footer>
</form>
