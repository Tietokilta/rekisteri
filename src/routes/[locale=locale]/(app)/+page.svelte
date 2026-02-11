<script lang="ts">
  import { invalidateAll, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { toast } from "svelte-sonner";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import type { PageServerData } from "./$types";
  import MembershipCard from "$lib/components/membership-card.svelte";
  import ProfileIncompleteCard from "$lib/components/profile-incomplete-card.svelte";

  let { data }: { data: PageServerData } = $props();

  // Check if profile is complete
  const isProfileComplete = $derived(Boolean(data.user.firstNames && data.user.lastName && data.user.homeMunicipality));

  // Get full user name for QR modal
  const fullName = $derived(
    data.user.firstNames && data.user.lastName ? `${data.user.firstNames} ${data.user.lastName}` : data.user.email,
  );

  // Handle stripe success redirect
  $effect(() => {
    const stripeStatus = page.url.searchParams.get("stripeStatus");
    if (stripeStatus === "success") {
      // Show success toast
      toast.success($LL.dashboard.paymentSuccess(), {
        description: $LL.dashboard.paymentSuccessDescription(),
      });

      // Remove query param from URL
      goto(route("/[locale=locale]", { locale: $locale }), { replaceState: true });

      // Auto-refresh data after a short delay to allow webhook to process
      setTimeout(() => {
        void invalidateAll();
      }, 2000);
    }
  });
</script>

<div class="container mx-auto max-w-2xl px-4 py-8">
  <div class="space-y-4">
    {#if isProfileComplete}
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
