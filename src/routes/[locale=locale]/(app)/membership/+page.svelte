<script lang="ts">
  import type { PageServerData } from "./$types";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { formatDate } from "$lib/utils";
  import { route } from "$lib/ROUTES";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CreditCard from "@lucide/svelte/icons/credit-card";
  import History from "@lucide/svelte/icons/history";

  let { data }: { data: PageServerData } = $props();

  const eventLabels = {
    fi: {
      application_submitted: "Jäsenhakemus lähetetty",
      application_approved: "Jäsenhakemus hyväksytty",
      application_rejected: "Jäsenhakemus hylätty",
      type_change_requested: "Jäsenluokan muutosta haettu",
      type_changed: "Jäsenluokka muutettu",
      type_change_rejected: "Jäsenluokan muutos hylätty",
      resigned_voluntarily: "Eronnut jäsenyydestä",
      deemed_resigned_nonpayment: "Katsottu eronneeksi",
      expelled: "Erotettu jäsenyydestä",
      legacy_membership_started_inferred: "Jäsenyyden alku päätelty",
      legacy_resignation_inferred: "Jäsenyyden päättyminen päätelty",
      legacy_rejoin_inferred: "Jäsenyyteen palaaminen päätelty",
      legacy_type_changed_inferred: "Jäsenluokan muutos päätelty",
      membership_decision_corrected: "Jäsenyyspäätös korjattu",
    },
    en: {
      application_submitted: "Application submitted",
      application_approved: "Application approved",
      application_rejected: "Application rejected",
      type_change_requested: "Membership type change requested",
      type_changed: "Membership type changed",
      type_change_rejected: "Membership type change rejected",
      resigned_voluntarily: "Resigned from membership",
      deemed_resigned_nonpayment: "Membership ended for non-payment",
      expelled: "Expelled from membership",
      legacy_membership_started_inferred: "Membership start inferred",
      legacy_resignation_inferred: "Membership end inferred",
      legacy_rejoin_inferred: "Membership rejoin inferred",
      legacy_type_changed_inferred: "Membership type change inferred",
      membership_decision_corrected: "Membership decision corrected",
    },
  } as const;

  function typeName(type: NonNullable<typeof data.member>["membershipType"]) {
    if (!type) return "";
    return type.name[$locale];
  }
</script>

<div class="container mx-auto max-w-2xl px-4 py-8">
  <Card.Root>
    <Card.Header>
      <Card.Title>{$LL.membership.title()}</Card.Title>
      <Card.Description>{$LL.membership.historyDescription()}</Card.Description>
      <Card.Action>
        <Button href={route("/[locale=locale]/new", { locale: $locale })}>
          {data.member ? $LL.dashboard.purchaseNew() : $LL.dashboard.getFirstMembership()}
        </Button>
      </Card.Action>
    </Card.Header>
    <Card.Content class="space-y-6">
      {#if !data.member}
        <div class="flex flex-col items-center gap-4 py-8 text-center">
          <CreditCard class="size-16 text-muted-foreground" />
          <p class="text-lg font-medium">{$LL.dashboard.noMembership()}</p>
          <Button href={route("/[locale=locale]/new", { locale: $locale })}>
            {$LL.dashboard.getFirstMembership()}
          </Button>
        </div>
      {:else}
        <Item.Root
          variant="outline"
          class={data.member.status === "active" ? "border-green-500/50 bg-green-500/5" : ""}
        >
          <Item.Media variant="icon"><CircleCheck /></Item.Media>
          <Item.Content>
            <Item.Title class="flex-wrap">
              <span>{typeName(data.member.pendingMembershipType ?? data.member.membershipType)}</span>
              <Badge variant={data.member.status === "active" ? "default" : "secondary"}>
                {data.member.status === "active"
                  ? $LL.membership.status.active()
                  : data.member.status === "awaiting_payment"
                    ? $LL.membership.status.awaitingPayment()
                    : data.member.status === "awaiting_approval"
                      ? $LL.membership.status.awaitingApproval()
                      : data.member.status === "ended"
                        ? $LL.membership.status.resigned()
                        : $LL.membership.status.rejected()}
              </Badge>
            </Item.Title>
            {#if data.member.currentMembershipStartedAt}
              <Item.Description>{formatDate(data.member.currentMembershipStartedAt, $locale)}</Item.Description>
            {/if}
          </Item.Content>
        </Item.Root>

        {#if data.member.events.length > 0}
          <div class="space-y-3">
            <h3 class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <History class="size-4" />
              {$LL.membership.pastMemberships()}
            </h3>
            {#each data.member.events as event (event.id)}
              <Item.Root variant="outline">
                <Item.Content>
                  <Item.Title>{eventLabels[$locale][event.eventType]}</Item.Title>
                  <Item.Description>{formatDate(event.effectiveAt, $locale)}</Item.Description>
                </Item.Content>
                {#if event.certainty === "inferred"}<Badge variant="outline"
                    >{$locale === "fi" ? "Päätelty" : "Inferred"}</Badge
                  >{/if}
              </Item.Root>
            {/each}
          </div>
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>
</div>
