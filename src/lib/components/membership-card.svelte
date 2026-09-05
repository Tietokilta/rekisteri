<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import { formatDate } from "$lib/utils";
  import type { MemberStatus } from "$lib/shared/enums";
  import type { LocalizedString } from "$lib/server/db/schema";
  import { retryPayment } from "$lib/api/retry-payment.remote";
  import { retryPaymentSchema } from "$lib/api/retry-payment.schema";
  import MemberQrModal from "$lib/components/member-qr-modal.svelte";

  // Icons
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Hourglass from "@lucide/svelte/icons/hourglass";
  import Banknote from "@lucide/svelte/icons/banknote";
  import CreditCard from "@lucide/svelte/icons/credit-card";

  interface MembershipType {
    id: string;
    name: LocalizedString;
  }

  interface Member {
    id: string;
    membershipType: MembershipType | null;
    pendingMembershipType: MembershipType | null;
    currentMembershipStartedAt: Date | null;
    status: MemberStatus;
  }

  interface Props {
    member: Member | null;
    feeState: "paid" | "overdue" | "not_due" | "no_fee" | "no_obligation";
    currentFeePeriod: { startDate: string; endDate: string } | null;
    userName: string;
    qrToken: string | null;
    hasAvailableMemberships: boolean;
  }

  let { member, feeState, currentFeePeriod, userName, qrToken, hasAvailableMemberships }: Props = $props();

  // Helper to get localized membership type name
  function getTypeName(membershipType: MembershipType): string {
    return $locale === "fi" ? membershipType.name.fi : membershipType.name.en;
  }

  const currentMembershipType = $derived(member?.membershipType ?? member?.pendingMembershipType ?? null);
  const hasActiveMembership = $derived(member?.status === "active");
  const isAwaitingPayment = $derived(member?.status === "awaiting_payment");
  const isRenewalDue = $derived(member?.status === "active" && (feeState === "not_due" || feeState === "overdue"));
  const showQrButton = $derived(!!qrToken && hasActiveMembership);

  // Compute purchase/renew button config
  const purchaseAction = $derived.by(() => {
    if (isAwaitingPayment || !hasAvailableMemberships) return null;
    if (!member) return { label: $LL.dashboard.getFirstMembership(), variant: "default" as const };
    if (isRenewalDue) return { label: $LL.dashboard.renewMembership(), variant: "default" as const };
    if (hasActiveMembership)
      return {
        label: $LL.dashboard.purchaseNew(),
        variant: showQrButton ? ("outline" as const) : ("default" as const),
      };
    return {
      label: $LL.dashboard.renewMembership(),
      variant: showQrButton ? ("outline" as const) : ("default" as const),
    };
  });

  // Status badge variant and icon
  const statusConfig = $derived.by(() => {
    if (!member) {
      return {
        variant: "outline" as const,
        icon: CircleAlert,
        label: $LL.dashboard.noMembership(),
        cardClass: "border-muted",
      };
    }

    if (isRenewalDue) {
      return {
        variant: "secondary" as const,
        icon: Banknote,
        label: $LL.membership.status.activePaymentDue(),
        cardClass: "border-yellow-500/50 bg-yellow-500/5",
      };
    }

    switch (member.status) {
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
      case "ended":
        return {
          variant: "destructive" as const,
          icon: CircleAlert,
          label: $LL.membership.status.resigned(),
          cardClass: "border-destructive/50 bg-destructive/5",
        };
      case "rejected":
        return {
          variant: "destructive" as const,
          icon: CircleAlert,
          label: $LL.membership.status.rejected(),
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
    {#if member && currentMembershipType}
      <div class="space-y-1">
        <p class="text-lg font-medium">{userName}</p>
        <p class="text-2xl font-semibold">{getTypeName(currentMembershipType)}</p>
        {#if member.currentMembershipStartedAt}
          <p class="text-sm text-muted-foreground">
            <time datetime={member.currentMembershipStartedAt.toISOString()}>
              {formatDate(member.currentMembershipStartedAt, $locale)}
            </time>
          </p>
        {:else if currentFeePeriod}
          <p class="text-sm text-muted-foreground">
            {formatDate(new Date(currentFeePeriod.startDate), $locale)} –
            {formatDate(new Date(currentFeePeriod.endDate), $locale)}
          </p>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col items-center gap-2 py-4 text-center">
        <CreditCard class="size-12 text-muted-foreground" />
        <p class="text-muted-foreground">{$LL.dashboard.noMembership()}</p>
      </div>
    {/if}
  </Card.Content>
  <Card.Footer class="flex flex-wrap gap-2">
    {#if isAwaitingPayment && member}
      <form {...retryPayment.preflight(retryPaymentSchema)} class="flex-1">
        <input type="hidden" name="memberId" value={member.id} />
        <Button type="submit" class="w-full" disabled={!!retryPayment.pending}>
          {#if retryPayment.pending}
            {$LL.common.loading()}
          {:else}
            {$LL.dashboard.completePayment()}
          {/if}
        </Button>
      </form>
    {/if}
    {#if showQrButton && qrToken}
      <MemberQrModal token={qrToken} {userName} class="flex-1" />
    {/if}
    {#if purchaseAction}
      <Button variant={purchaseAction.variant} href={route("/[locale=locale]/new", { locale: $locale })} class="flex-1">
        {purchaseAction.label}
      </Button>
    {/if}
    {#if member}
      <Button variant="outline" href={route("/[locale=locale]/membership", { locale: $locale })} class="flex-1">
        {$LL.dashboard.viewAll()}
      </Button>
    {/if}
  </Card.Footer>
</Card.Root>
