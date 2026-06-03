<script lang="ts">
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { page } from "$app/state";
  import { renderMarkdown } from "$lib/markdown";

  const appName = $derived(page.data.customizations.appName[$locale]);
  const privacyPolicy = $derived(page.data.customizations.privacyPolicy[$locale]);
  const privacyPolicyHtml = $derived(renderMarkdown(privacyPolicy));
</script>

<svelte:head>
  <title>{$LL.admin.customize.privacyPolicy.title()} - {appName}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
  <div class="mx-auto prose dark:prose-invert">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html privacyPolicyHtml}
  </div>
</div>
