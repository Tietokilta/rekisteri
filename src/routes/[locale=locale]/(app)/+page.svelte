<script lang="ts">
  import { refreshAll, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { toast } from "svelte-sonner";
  import { LL, locale } from "#lib/i18n/i18n-svelte.js";
  import { route } from "#lib/ROUTES.js";
  import type { PageServerData } from "./$types";
  import MembershipCard from "#lib/components/membership-card.svelte";
  import ProfileIncompleteCard from "#lib/components/profile-incomplete-card.svelte";
  import OnboardingChecklist from "#lib/components/onboarding-checklist.svelte";
  import { formatFullName } from "#lib/utils.js";

  let { data }: { data: PageServerData } = $props();

  // Check if profile is complete
  const isProfileComplete = $derived(Boolean(data.user.firstNames && data.user.lastName && data.user.homeMunicipality));

  // Users who have never had a membership get a step-by-step checklist instead
  const isNewApplicant = $derived(data.memberships.length === 0);

  // Get full user name for QR modal
  const fullName = $derived(formatFullName(data.user, data.user.email));

  // Handle stripe success redirect
  $effect(() => {
    const stripeStatus = page.url.searchParams.get("stripeStatus");
    if (stripeStatus !== "success") {
      return;
    }

    // Show success toast
    toast.success($LL.dashboard.paymentSuccess(), {
      description: $LL.dashboard.paymentSuccessDescription(),
    });

    // Remove query param from URL
    goto(route("/[locale=locale]", { locale: $locale }), { replace: true });

    // Auto-refresh data after a short delay to allow webhook to process
    setTimeout(() => {
      void refreshAll();
    }, 2000);
  });
</script>

<div class="container mx-auto max-w-2xl px-4 py-8">
  <div class="space-y-4">
    {#if isNewApplicant}
      <OnboardingChecklist {isProfileComplete} />
    {:else if isProfileComplete}
      <MembershipCard
        memberships={data.memberships}
        userName={fullName}
        qrToken={data.qrToken}
        hasAvailableMemberships={data.hasAvailableMemberships}
      />
    {:else}
      <ProfileIncompleteCard />
    {/if}
  </div>
</div>
