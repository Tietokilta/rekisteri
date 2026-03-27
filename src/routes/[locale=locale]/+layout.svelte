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
    {data.customisations?.appName?.[$locale] ?? $LL.app.title()}
  </title>
  {#if data.customisations?.favicon}
    <link rel="icon" href="/api/image/favicon" media="(prefers-color-scheme: light)" />
  {/if}
  {#if data.customisations?.faviconDark}
    <link rel="icon" href="/api/image/faviconDark" media="(prefers-color-scheme: dark)" />
  {/if}
  {#if data.customisations?.accentColor}
    {@html `<style>:root { --primary: ${data.customisations.accentColor}; }</style>`}
  {/if}
</svelte:head>

<ModeWatcher disableHeadScriptInjection />
<Toaster position="top-center" />
{@render children()}
