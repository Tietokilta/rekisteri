<script lang="ts">
  import type { PageServerData } from "./$types";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import type { MemberStatus } from "$lib/shared/enums";

  // Icons
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Hourglass from "@lucide/svelte/icons/hourglass";
  import Banknote from "@lucide/svelte/icons/banknote";
  import CreditCard from "@lucide/svelte/icons/credit-card";
  import History from "@lucide/svelte/icons/history";
  import RotateCw from "@lucide/svelte/icons/rotate-cw";

  let { data }: { data: PageServerData } = $props();

  // Separate active/pending from past memberships
  const activeMemberships = $derived(
    data.memberships.filter(
      (m) => m.status === "active" || m.status === "awaiting_payment" || m.status === "awaiting_approval",
    ),
  );

  const pastMemberships = $derived(data.memberships.filter((m) => m.status === "resigned" || m.status === "rejected"));

  // Check if a resigned membership was renewed (has an adjacent later membership of the same type).
  // "Adjacent" means the next period starts within ~6 months of this period's end,
  // matching the auto-approval logic in src/lib/server/payment/auto-approval.ts.
  const MAX_RENEWAL_GAP_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months

  function wasRenewed(membership: (typeof data.memberships)[number]): boolean {
    if (membership.status !== "resigned") return false;
    const endTime = new Date(membership.endTime).getTime();
    return data.memberships.some((m) => {
      if (m.membershipTypeId !== membership.membershipTypeId) return false;
      const startTime = new Date(m.startTime).getTime();
      return startTime > endTime && startTime - endTime <= MAX_RENEWAL_GAP_MS;
    });
  }

  function getStatusConfig(status: MemberStatus | "renewed") {
    switch (status) {
      case "active":
        return {
          variant: "default" as const,
          icon: CircleCheck,
          label: $LL.membership.status.active(),
        };
      case "awaiting_payment":
        return {
          variant: "secondary" as const,
          icon: Banknote,
          label: $LL.membership.status.awaitingPayment(),
        };
      case "awaiting_approval":
        return {
          variant: "secondary" as const,
          icon: Hourglass,
          label: $LL.membership.status.awaitingApproval(),
        };
      case "renewed":
        return {
          variant: "outline" as const,
          icon: RotateCw,
          label: $LL.membership.status.renewed(),
        };
      case "resigned":
        return {
          variant: "outline" as const,
          icon: CircleAlert,
          label: $LL.membership.status.resigned(),
        };
      case "rejected":
        return {
          variant: "outline" as const,
          icon: CircleAlert,
          label: $LL.membership.status.rejected(),
        };
      default:
        return {
          variant: "outline" as const,
          icon: CircleAlert,
          label: $LL.membership.status.unknown(),
        };
    }
  }

  function formatDateRange(startTime: Date, endTime: Date) {
    const start = new Date(startTime).toLocaleDateString(`${$locale}-FI`);
    const end = new Date(endTime).toLocaleDateString(`${$locale}-FI`);
    return `${start} – ${end}`;
  }

  function getTypeName(membership: (typeof data.memberships)[number]) {
    return $locale === "fi" ? membership.membershipType.name.fi : membership.membershipType.name.en;
  }
</script>

<div class="container mx-auto max-w-2xl px-4 py-8">
  <Card.Root>
    <Card.Header>
      <Card.Title>{$LL.membership.title()}</Card.Title>
      <Card.Description>{$LL.membership.historyDescription()}</Card.Description>
      <Card.Action>
        <Button href={route("/[locale=locale]/new", { locale: $locale })}>
          {#if data.memberships.length === 0}
            {$LL.dashboard.getFirstMembership()}
          {:else}
            {$LL.dashboard.purchaseNew()}
          {/if}
        </Button>
      </Card.Action>
    </Card.Header>
    <Card.Content class="space-y-6">
      {#if data.memberships.length === 0}
        <!-- No memberships -->
        <div class="flex flex-col items-center gap-4 py-8 text-center">
          <CreditCard class="size-16 text-muted-foreground" />
          <div class="space-y-2">
            <p class="text-lg font-medium">{$LL.dashboard.noMembership()}</p>
            <p class="text-sm text-muted-foreground">{$LL.membership.getStarted()}</p>
          </div>
          <Button href={route("/[locale=locale]/new", { locale: $locale })} class="mt-2">
            {$LL.dashboard.getFirstMembership()}
          </Button>
        </div>
      {:else}
        <!-- Active/Pending memberships -->
        {#if activeMemberships.length > 0}
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-muted-foreground">{$LL.membership.currentMemberships()}</h3>
            {#each activeMemberships as membership (membership.unique_id)}
              {@const config = getStatusConfig(membership.status)}
              <Item.Root
                variant="outline"
                class={membership.status === "active"
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-yellow-500/50 bg-yellow-500/5"}
              >
                <Item.Media variant="icon">
                  <config.icon />
                </Item.Media>
                <Item.Content>
                  <Item.Title class="flex-wrap">
                    <span>{getTypeName(membership)}</span>
                    <Badge variant={config.variant}>
                      <config.icon class="mr-1 size-3" />
                      {config.label}
                    </Badge>
                  </Item.Title>
                  <Item.Description>
                    {formatDateRange(membership.startTime, membership.endTime)}
                  </Item.Description>
                </Item.Content>
              </Item.Root>
            {/each}
          </div>
        {/if}

        <!-- Past memberships -->
        {#if pastMemberships.length > 0}
          <div class="space-y-3">
            <h3 class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <History class="size-4" />
              {$LL.membership.pastMemberships()}
            </h3>
            {#each pastMemberships as membership (membership.unique_id)}
              {@const displayStatus = wasRenewed(membership) ? "renewed" : membership.status}
              {@const config = getStatusConfig(displayStatus)}
              <Item.Root variant="outline" class="opacity-75">
                <Item.Media variant="icon">
                  <config.icon class="text-muted-foreground" />
                </Item.Media>
                <Item.Content>
                  <Item.Title class="flex-wrap">
                    <span>{getTypeName(membership)}</span>
                    <Badge variant={config.variant}>
                      {config.label}
                    </Badge>
                  </Item.Title>
                  <Item.Description>
                    {formatDateRange(membership.startTime, membership.endTime)}
                  </Item.Description>
                </Item.Content>
              </Item.Root>
            {/each}
          </div>
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>
</div>
