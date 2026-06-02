<script lang="ts">
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { page } from "$app/state";
  import { renderMarkdown } from "$lib/markdown";

  const appName = $derived(page.data.customizations.appName[$locale]);

  // Custom content from DB (if any)
  const fiCustom = $derived(page.data.customizations.privacyPolicy.fi);
  const enCustom = $derived(page.data.customizations.privacyPolicy.en);

  // Only use custom if it's not the default placeholder
  const hasCustom = $derived(
    ($locale === "fi" && fiCustom && fiCustom !== "Rekisteri- ja tietosuojaseloste") ||
      ($locale === "en" && enCustom && enCustom !== "Privacy Policy"),
  );

  const customContent = $derived($locale === "fi" ? fiCustom : enCustom);
  const customHtml = $derived(renderMarkdown(customContent));
</script>

<svelte:head>
  <title>{$LL.admin.customize.privacyPolicy.title()} - {appName}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
  <div class="mx-auto prose dark:prose-invert">
    {#if hasCustom}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html customHtml}
    {/if}
  </div>
</div>
