<script lang="ts">
  import type { PageProps } from "./$types";
  import { page } from "$app/state";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button";
  import ProfileIncompleteCard from "$lib/components/profile-incomplete-card.svelte";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { payMembership } from "./data.remote";
  import { payMembershipSchema } from "./schema";
  import { formatDate, formatPrice } from "$lib/utils";
  import { getStripePriceMetadata } from "$lib/api/stripe.remote";
  import { Textarea } from "$lib/components/ui/textarea";
  import { PersistedState } from "runed";
  import { onMount, tick } from "svelte";

  interface PurchaseFormState {
    feePeriodId: string;
    description: string;
    isStudent: boolean;
  }

  const formPersist = new PersistedState<PurchaseFormState | null>("purchase-form-state", null, {
    storage: "session",
  });

  const { data }: PageProps = $props();

  const availableFeePeriods = $derived(data.availableFeePeriods);

  // Check if profile is complete
  const isProfileComplete = $derived(Boolean(data.user.firstNames && data.user.lastName && data.user.homeMunicipality));

  let isStudent = $state(false);
  let restored = $state(false);
  let requireStudentVerification = $derived(
    availableFeePeriods.find((feePeriod) => feePeriod.id === payMembership.fields.feePeriodId.value())?.membershipType
      .requiresStudentVerification ?? false,
  );
  let disableForm = $derived(
    (requireStudentVerification && (!isStudent || !data.hasValidAaltoEmail)) || availableFeePeriods.length === 0,
  );

  // Build the URL to the emails page with a ?next= param so the email
  // verification flow redirects back here after completion.
  const emailsUrlWithNext = $derived(
    `${route("/[locale=locale]/settings/emails", { locale: $locale })}?next=${encodeURIComponent(route("/[locale=locale]/new", { locale: $locale }))}`,
  );

  const rulesUrl = $derived(page.data.customizations?.organizationRulesUrl?.[$locale]);

  // Auto-save form state to sessionStorage whenever values change.
  // Guard: skip until onMount restore completes to avoid overwriting saved state.
  $effect(() => {
    if (!restored) return;
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
    formPersist.current = {
      feePeriodId: payMembership.fields.feePeriodId.value() ?? "",
      description: textarea?.value ?? "",
      isStudent,
    };
  });

  /**
   * On mount, restore form state from sessionStorage if available (e.g. after
   * returning from the email verification flow).
   */
  onMount(async () => {
    const saved = formPersist.current;
    if (!saved) {
      restored = true;
      return;
    }
    formPersist.current = null;

    isStudent = saved.isStudent;
    await tick();

    if (saved.feePeriodId) {
      const radio = document.querySelector<HTMLInputElement>(
        `input[type="radio"][name="feePeriodId"][value="${CSS.escape(saved.feePeriodId)}"]`,
      );
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("input", { bubbles: true }));
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    await tick();

    if (saved.description) {
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
      if (textarea) {
        textarea.value = saved.description;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    restored = true;
  });
</script>

<div class="container mx-auto max-w-2xl px-4 py-8">
  {#if !isProfileComplete}
    <ProfileIncompleteCard />
  {:else}
    <Card.Root>
      <Card.Header>
        <Card.Title>{$LL.membership.buy()}</Card.Title>
        <Card.Description>{$LL.membership.select()}</Card.Description>
      </Card.Header>
      <!-- Show membership options when profile is complete -->
      <Card.Content>
        <form {...payMembership.preflight(payMembershipSchema)} class="flex flex-col gap-4">
          {#if availableFeePeriods.length === 0}
            <Alert.Root>
              <CircleAlert class="h-4 w-4" />
              <Alert.Description>{$LL.membership.noAvailableMemberships()}</Alert.Description>
            </Alert.Root>
          {/if}
          <div class="space-y-3">
            {#each availableFeePeriods as feePeriod (feePeriod.id)}
              {@const typeName = $locale === "fi" ? feePeriod.membershipType.name.fi : feePeriod.membershipType.name.en}
              {@const typeDescription = feePeriod.membershipType.description
                ? $locale === "fi"
                  ? feePeriod.membershipType.description.fi
                  : feePeriod.membershipType.description.en
                : null}
              <label
                class="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:border-primary hover:border-primary has-checked:border-primary has-checked:bg-accent"
              >
                <input {...payMembership.fields.feePeriodId.as("radio", feePeriod.id)} required class="mt-1" />
                <div class="flex flex-col gap-1">
                  <span class="font-medium">
                    {typeName}
                    {#if feePeriod.stripePriceId}
                      <svelte:boundary>
                        {@const price = await getStripePriceMetadata(feePeriod.stripePriceId)}
                        ({formatPrice(price.priceCents, price.currency, $locale)})
                        {#snippet failed()}{/snippet}
                      </svelte:boundary>
                    {/if}
                  </span>
                  <span class="text-sm text-muted-foreground">
                    {formatDate(new Date(feePeriod.startDate), $locale)}
                    – {formatDate(new Date(feePeriod.endDate), $locale)}
                  </span>
                  {#if feePeriod.requiresBoardApproval}
                    <span class="text-xs text-muted-foreground">{$LL.membership.willRequireApproval()}</span>
                  {:else}
                    <span class="text-xs text-green-600 dark:text-green-400">{$LL.membership.renewalNoApproval()}</span>
                  {/if}
                  {#if typeDescription}
                    <span class="text-sm text-muted-foreground">{typeDescription}</span>
                  {/if}
                </div>
              </label>
            {/each}

            {#if rulesUrl}
              <a
                href={rulesUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                <ExternalLink class="size-4" />
                {$LL.membership.moreInfoInBylaws()}
              </a>
            {/if}
          </div>

          {#if payMembership.fields.feePeriodId.value()}
            <div class="space-y-2">
              <label for="description" class="text-sm font-medium">
                {$LL.membership.description()}
                {#if requireStudentVerification}
                  <span class="font-normal text-muted-foreground">({$LL.common.optional()})</span>
                {/if}
              </label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                required={!requireStudentVerification}
                placeholder={$LL.membership.descriptionPlaceholder()}
              />
            </div>
          {/if}

          {#if requireStudentVerification}
            <div class="space-y-3">
              <div class="rounded-lg border p-4">
                <label class="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" name="isStudent" bind:checked={isStudent} required class="mt-1 rounded" />
                  <span class="text-sm">{$LL.membership.isStudent()}</span>
                </label>
              </div>

              {#if data.hasValidAaltoEmail}
                <Alert.Root
                  variant="default"
                  class="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
                >
                  <CircleCheck class="h-4 w-4 text-green-600 dark:text-green-400" />
                  <Alert.Description class="text-green-800 dark:text-green-200">
                    {$LL.secondaryEmail.verifiedDomainEmail()}
                    {#if data.aaltoEmailExpiry}
                      ({$LL.secondaryEmail.expiresOn({
                        date: formatDate(new Date(data.aaltoEmailExpiry), $locale),
                      })})
                    {/if}
                  </Alert.Description>
                </Alert.Root>
              {:else if data.hasExpiredAaltoEmail}
                <Alert.Root variant="destructive">
                  <CircleAlert class="h-4 w-4" />
                  <Alert.Description>
                    {$LL.secondaryEmail.expiredMessage()}
                    <a href={emailsUrlWithNext} class="ml-1 font-medium underline">
                      {$LL.secondaryEmail.reverifyNow()}
                    </a>
                  </Alert.Description>
                </Alert.Root>
              {:else}
                <Alert.Root variant="destructive">
                  <CircleAlert class="h-4 w-4" />
                  <Alert.Description>
                    {$LL.secondaryEmail.notVerifiedMessage()}
                    <a href={emailsUrlWithNext} class="ml-1 font-medium underline">
                      {$LL.secondaryEmail.addDomainEmail({ domain: "aalto.fi" })}
                    </a>
                  </Alert.Description>
                </Alert.Root>
              {/if}
            </div>
          {/if}

          <Button
            type="submit"
            disabled={disableForm || !!payMembership.pending}
            class={disableForm ? "cursor-not-allowed opacity-50" : ""}
          >
            {$LL.membership.buy()}
            {#if payMembership.fields.feePeriodId.value()}
              {@const selectedFeePeriod = availableFeePeriods.find(
                (feePeriod) => feePeriod.id === payMembership.fields.feePeriodId.value(),
              )}
              {#if selectedFeePeriod?.stripePriceId}
                <svelte:boundary>
                  {@const price = await getStripePriceMetadata(selectedFeePeriod.stripePriceId)}
                  ({formatPrice(price.priceCents, price.currency, $locale)})
                  {#snippet failed()}{/snippet}
                </svelte:boundary>
              {/if}
            {/if}
          </Button>
        </form>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
