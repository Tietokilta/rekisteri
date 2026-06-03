<script lang="ts">
  import { locale } from "$lib/i18n/i18n-svelte";
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
    {data.customizations.appName[$locale]}
  </title>
  <link rel="icon" href={data.customizations.faviconUrl} type="image/png" media="(prefers-color-scheme: light)" />
  <link rel="icon" href={data.customizations.faviconDarkUrl} type="image/png" media="(prefers-color-scheme: dark)" />
  {#if data.customizations.accentColor}
    <!-- Inject Accent Color value as primary. Only admin can set and it's validated as an RGB hex -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html `<style>:root { --primary: ${data.customizations.accentColor}; }</style>`}
  {/if}
</svelte:head>

<ModeWatcher disableHeadScriptInjection />
<Toaster position="top-center" />
{@render children()}
