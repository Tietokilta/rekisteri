<script lang="ts">
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { page } from "$app/state";

  const appName = $derived(page.data.customisations?.appName?.[$locale] ?? $LL.app.title());

  // Custom content from DB (if any)
  const fiCustom = $derived(page.data.customisations?.privacyPolicy?.fi);
  const enCustom = $derived(page.data.customisations?.privacyPolicy?.en);

  // Only use custom if it's not the default placeholder
  const hasCustom = $derived(
    ($locale === "fi" && fiCustom && fiCustom !== "Rekisteri- ja tietosuojaseloste") ||
      ($locale === "en" && enCustom && enCustom !== "Privacy Policy"),
  );

  const customContent = $derived($locale === "fi" ? fiCustom : enCustom);
</script>

<svelte:head>
  <title>{$LL.admin.customise.privacyPolicy.title()} - {appName}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
  <div class="mx-auto prose dark:prose-invert">
    {#if hasCustom}
      <div class="whitespace-pre-wrap">{customContent}</div>
    {/if}
  </div>
</div>
