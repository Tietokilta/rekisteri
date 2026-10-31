<script lang="ts">
  import type { PageProps } from "./$types";
  import { page } from "$app/state";
  import { LL, locale } from "#lib/i18n/i18n-svelte.js";
  import { route } from "#lib/ROUTES.js";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import ProfileIncompleteCard from "#lib/components/profile-incomplete-card.svelte";
  import StudentEmailVerification from "#lib/components/student-email-verification.svelte";
  import PersonalEmailPrompt from "#lib/components/personal-email-prompt.svelte";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { payMembership } from "./data.remote";
  import { payMembershipSchema } from "./schema";
  import { getStripePriceMetadata } from "#lib/api/stripe.remote.js";
  import { formatDate, formatPrice } from "#lib/utils.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { BLOCKING_MEMBER_STATUSES } from "#lib/shared/enums.js";
  import { PersistedState } from "runed";
  import { onMount, tick } from "svelte";

  interface PurchaseFormState {
    membershipId: string;
    description: string;
    isStudent: boolean;
  }

  const formPersist = new PersistedState<PurchaseFormState | null>("purchase-form-state", null, {
    storage: "session",
  });

  const { data }: PageProps = $props();

  const memberships = $derived(data.memberships);
  const availableMemberships = $derived(data.availableMemberships);
  // Only show memberships that have a Stripe price ID
  // Only block memberships that are active or pending - allow repurchasing cancelled/expired memberships
  const filteredMemberships = $derived(
    availableMemberships.filter(
      (a): a is typeof a & { stripePriceId: string } =>
        !!a.stripePriceId && memberships.every((b) => !(a.id === b.id && BLOCKING_MEMBER_STATUSES.has(b.status))),
    ),
  );

  // Check if profile is complete
  const isProfileComplete = $derived(Boolean(data.user.firstNames && data.user.lastName && data.user.homeMunicipality));

  let isStudent = $state(false);
  let restored = $state(false);
  let requireStudentVerification = $derived(
    availableMemberships.find((e) => e.id === payMembership.fields.membershipId.value())?.requiresStudentVerification ??
      false,
  );
  let disableForm = $derived(
    (requireStudentVerification && (!isStudent || !data.hasValidAaltoEmail)) || filteredMemberships.length === 0,
  );

  const rulesUrl = $derived(page.data.customizations?.organizationRulesUrl?.[$locale]);

  // Auto-save form state to sessionStorage whenever values change.
  // Guard: skip until onMount restore completes to avoid overwriting saved state.
  $effect(() => {
    if (!restored) return;
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea#description");
    formPersist.current = {
      membershipId: payMembership.fields.membershipId.value() ?? "",
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

    if (saved.membershipId) {
      const radio = document.querySelector<HTMLInputElement>(
        `input[type="radio"][value="${CSS.escape(saved.membershipId)}"]`,
      );
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("input", { bubbles: true }));
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    await tick();

    if (saved.description) {
      const textarea = document.querySelector<HTMLTextAreaElement>("textarea#description");
      if (textarea) {
        textarea.value = saved.description;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    restored = true;
  });
</script>

<div class="container mx-auto max-w-2xl px-4 py-8">
  {#if data.needsPersonalEmail}
    <div class="mb-4">
      <PersonalEmailPrompt userId={data.user.id} domain={data.user.email.split("@", 2)[1] ?? ""} />
    </div>
  {/if}
  {#if !isProfileComplete}
    <ProfileIncompleteCard next={route("/[locale=locale]/new", { locale: $locale })} />
  {:else}
    <Card.Root>
      <Card.Header>
        <Card.Title>{$LL.membership.buy()}</Card.Title>
        <Card.Description>{$LL.membership.select()}</Card.Description>
      </Card.Header>
      <!-- Show membership options when profile is complete -->
      <Card.Content>
        <form id="pay-membership-form" {...payMembership.preflight(payMembershipSchema)} class="flex flex-col gap-4">
          {#if filteredMemberships.length === 0}
            <Alert.Root>
              <CircleAlert class="h-4 w-4" />
              <Alert.Description>{$LL.membership.noAvailableMemberships()}</Alert.Description>
            </Alert.Root>
          {/if}
          <div class="space-y-3">
            {#each filteredMemberships as membership (membership.id)}
              {@const typeName =
                $locale === "fi" ? membership.membershipType.name.fi : membership.membershipType.name.en}
              {@const typeDescription = membership.membershipType.description
                ? $locale === "fi"
                  ? membership.membershipType.description.fi
                  : membership.membershipType.description.en
                : null}
              <label
                class="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:border-primary hover:border-primary has-checked:border-primary has-checked:bg-accent"
              >
                <input {...payMembership.fields.membershipId.as("radio", membership.id)} required class="mt-1" />
                <div class="flex flex-col gap-1">
                  <svelte:boundary>
                    {@const priceMetadata = await getStripePriceMetadata(membership.stripePriceId)}
                    <span class="font-medium">
                      {typeName} ({formatPrice(priceMetadata.priceCents, priceMetadata.currency, $locale)})
                    </span>
                    {#snippet failed()}
                      <span class="font-medium text-destructive">{$LL.admin.memberships.failedToLoadPrice()}</span>
                    {/snippet}
                  </svelte:boundary>
                  <span class="text-sm text-muted-foreground">
                    {formatDate(new Date(membership.startTime), $locale)}
                    – {formatDate(new Date(membership.endTime), $locale)}
                  </span>
                  {#if membership.willAutoApprove}
                    <span class="text-xs text-green-600 dark:text-green-400">{$LL.membership.willAutoApprove()}</span>
                  {:else}
                    <span class="text-xs text-muted-foreground">{$LL.membership.willRequireApproval()}</span>
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

          {#if payMembership.fields.membershipId.value()}
            <div class="space-y-2">
              <label for="description" class="text-sm font-medium">
                {$LL.membership.description()}
                {#if requireStudentVerification}
                  <span class="font-normal text-muted-foreground">({$LL.common.optional()})</span>
                {/if}
              </label>
              <Textarea
                id="description"
                {...payMembership.fields.description.as("text")}
                rows={3}
                required={!requireStudentVerification}
                placeholder={$LL.membership.descriptionPlaceholder()}
              />
            </div>
          {/if}
        </form>

        {#if requireStudentVerification}
          <div class="mt-4 space-y-3">
            <div class="rounded-lg border p-4">
              <label class="flex cursor-pointer items-start gap-3">
                <input type="checkbox" data-testid="is-student" bind:checked={isStudent} class="mt-1 rounded" />
                <span class="text-sm">{$LL.membership.isStudent()}</span>
              </label>
            </div>

            {#if isStudent}
              <StudentEmailVerification
                domain="aalto.fi"
                verifiedEmail={data.validAaltoEmail}
                verifiedUntil={data.aaltoEmailExpiry ?? null}
                expiredEmail={data.expiredAaltoEmail}
                expiredAt={data.expiredAaltoEmail ? (data.aaltoEmailExpiry ?? null) : null}
                next={route("/[locale=locale]/new", { locale: $locale })}
              />
            {/if}
          </div>
        {/if}

        <!-- Outside the form so the verification above can use its own forms -->
        <Button
          type="submit"
          form="pay-membership-form"
          disabled={disableForm || !!payMembership.pending}
          class={disableForm ? "mt-4 w-full cursor-not-allowed opacity-50" : "mt-4 w-full"}
        >
          {$LL.membership.buy()}
          {#if payMembership.fields.membershipId.value()}
            {@const selectedMembership = availableMemberships.find(
              (x) => x.id === payMembership.fields.membershipId.value(),
            )}
            {#if selectedMembership?.stripePriceId}
              <svelte:boundary>
                {@const priceMetadata = await getStripePriceMetadata(selectedMembership.stripePriceId)}
                ({formatPrice(priceMetadata.priceCents, priceMetadata.currency, $locale)})
                {#snippet failed()}
                  <span>(-)</span>
                {/snippet}
              </svelte:boundary>
            {/if}
          {/if}
        </Button>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
