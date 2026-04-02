<script lang="ts">
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import "../../app.css";
  import "@fontsource-variable/inter";
  import "@fontsource-variable/roboto-mono";
  import { ModeWatcher } from "mode-watcher";
  import { Toaster } from "$lib/components/ui/sonner";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();
</script>

<svelte:head>
  <title>
    {data.customizations?.appName?.[$locale] ?? $LL.app.title()}
  </title>
  {#if data.customizations?.favicon}
    <link rel="icon" href="/api/image/favicon" media="(prefers-color-scheme: light)" />
  {/if}
  {#if data.customizations?.faviconDark}
    <link rel="icon" href="/api/image/faviconDark" media="(prefers-color-scheme: dark)" />
  {/if}
  {#if data.customizations?.accentColor}
    <!-- Inject Accent Color value as primary. Only admin can set and it's validated as an RGB hex -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html `<style>:root { --primary: ${data.customizations.accentColor}; }</style>`}
  {/if}
</svelte:head>

<ModeWatcher disableHeadScriptInjection />
<Toaster position="top-center" />
{@render children()}
