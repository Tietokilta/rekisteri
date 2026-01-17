<script lang="ts">
	import * as Card from "$lib/components/ui/card/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { route } from "$lib/ROUTES";
	import type { MemberStatus } from "$lib/shared/enums";

	// Icons
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import CircleAlert from "@lucide/svelte/icons/circle-alert";
	import Hourglass from "@lucide/svelte/icons/hourglass";
	import Banknote from "@lucide/svelte/icons/banknote";
	import CreditCard from "@lucide/svelte/icons/credit-card";

	interface Membership {
		type: string;
		startTime: Date;
		endTime: Date;
		status: MemberStatus;
		unique_id: string;
	}

	interface Props {
		memberships: Membership[];
	}

	let { memberships }: Props = $props();

	// Get the most relevant membership (active > awaiting > expired)
	const currentMembership = $derived.by(() => {
		const active = memberships.find((m) => m.status === "active");
		if (active) return active;

		const awaiting = memberships.find((m) => m.status === "awaiting_payment" || m.status === "awaiting_approval");
		if (awaiting) return awaiting;

		// Return most recent membership
		return memberships[0] ?? null;
	});

	const hasActiveMembership = $derived(memberships.some((m) => m.status === "active"));

	// Status badge variant and icon
	const statusConfig = $derived.by(() => {
		if (!currentMembership) {
			return {
				variant: "outline" as const,
				icon: CircleAlert,
				label: $LL.dashboard.noMembership(),
				cardClass: "border-muted",
			};
		}

		switch (currentMembership.status) {
			case "active":
				return {
					variant: "default" as const,
					icon: CircleCheck,
					label: $LL.membership.status.active(),
					cardClass: "border-green-500/50 bg-green-500/5",
				};
			case "awaiting_payment":
				return {
					variant: "secondary" as const,
					icon: Banknote,
					label: $LL.membership.status.awaitingPayment(),
					cardClass: "border-yellow-500/50 bg-yellow-500/5",
				};
			case "awaiting_approval":
				return {
					variant: "secondary" as const,
					icon: Hourglass,
					label: $LL.membership.status.awaitingApproval(),
					cardClass: "border-yellow-500/50 bg-yellow-500/5",
				};
			case "expired":
				return {
					variant: "destructive" as const,
					icon: CircleAlert,
					label: $LL.membership.status.expired(),
					cardClass: "border-destructive/50 bg-destructive/5",
				};
			case "cancelled":
				return {
					variant: "destructive" as const,
					icon: CircleAlert,
					label: $LL.membership.status.expired(),
					cardClass: "border-destructive/50 bg-destructive/5",
				};
			default:
				return {
					variant: "outline" as const,
					icon: CircleAlert,
					label: $LL.membership.status.unknown(),
					cardClass: "border-muted",
				};
		}
	});
</script>

<Card.Root class={statusConfig.cardClass}>
	<Card.Header>
		<Card.Title>{$LL.dashboard.membershipStatus()}</Card.Title>
		<Card.Action>
			<Badge variant={statusConfig.variant}>
				{@const Icon = statusConfig.icon}
				<Icon class="mr-1 size-3" />
				{statusConfig.label}
			</Badge>
		</Card.Action>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if currentMembership}
			<div class="space-y-1">
				<p class="text-2xl font-semibold">{currentMembership.type}</p>
				<p class="text-sm text-muted-foreground">
					<time datetime={currentMembership.startTime.toISOString()}>
						{currentMembership.startTime.toLocaleDateString(`${$locale}-FI`)}
					</time>
					–
					<time datetime={currentMembership.endTime.toISOString()}>
						{currentMembership.endTime.toLocaleDateString(`${$locale}-FI`)}
					</time>
				</p>
			</div>
		{:else}
			<div class="flex flex-col items-center gap-2 py-4 text-center">
				<CreditCard class="size-12 text-muted-foreground" />
				<p class="text-muted-foreground">{$LL.dashboard.noMembership()}</p>
			</div>
		{/if}
	</Card.Content>
	<Card.Footer class="flex gap-2">
		{#if memberships.length > 0}
			<Button variant="outline" href={route("/[locale=locale]/membership", { locale: $locale })} class="flex-1">
				{$LL.dashboard.viewAll()}
			</Button>
		{/if}
		<Button href={route("/[locale=locale]/new", { locale: $locale })} class="flex-1">
			{#if memberships.length === 0}
				{$LL.dashboard.getFirstMembership()}
			{:else if hasActiveMembership}
				{$LL.dashboard.purchaseNew()}
			{:else}
				{$LL.dashboard.renewMembership()}
			{/if}
		</Button>
	</Card.Footer>
</Card.Root>
