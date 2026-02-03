<script lang="ts">
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import FiContent, { metadata as fiMetadata } from "./fi.md";
  import EnContent, { metadata as enMetadata } from "./en.md";

  const metadata = { fi: fiMetadata, en: enMetadata } as const;
</script>

<svelte:head>
  <title>{metadata[$locale].title} - {$LL.app.title()}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
  <div class="mx-auto prose dark:prose-invert">
    {#if $locale === "fi"}
      <FiContent />
    {:else}
      <EnContent />
    {/if}
  </div>
</div>
