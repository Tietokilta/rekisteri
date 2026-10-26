<script lang="ts">
  import { locale } from "#lib/i18n/i18n-svelte.js";
  import "../../app.css";
  import "@fontsource-variable/inter/index.css";
  import "@fontsource-variable/roboto-mono/index.css";
  import { ModeWatcher } from "mode-watcher";
  import Footer from "#lib/components/footer.svelte";
  import type { LayoutData } from "./$types";

  // Like the public layout, minus the language toggle: these pages aren't under /{locale}
  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();
</script>

<svelte:head>
  <title>{data.customizations.appName[$locale]}</title>
  <link rel="icon" href={data.customizations.faviconUrl} type="image/png" media="(prefers-color-scheme: light)" />
  <link rel="icon" href={data.customizations.faviconDarkUrl} type="image/png" media="(prefers-color-scheme: dark)" />
  {#if data.customizations.accentColor}
    <!-- Inject Accent Color value as primary. Only admin can set and it's validated as an RGB hex -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html `<style>:root { --primary: ${data.customizations.accentColor}; }</style>`}
  {/if}
</svelte:head>

<ModeWatcher disableHeadScriptInjection />
<div class="relative flex min-h-svh flex-col bg-background">
  <header class="w-full border-b border-border/40 bg-background">
    <div class="container mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4">
      <img src={data.customizations.logoUrl} alt="App logo" class="h-12 w-12 dark:hidden" />
      <img src={data.customizations.logoDarkUrl} alt="App logo" class="hidden h-12 w-12 dark:block" />
      <span class="sr-only font-mono font-medium sm:not-sr-only sm:text-xl">
        {data.customizations.appName[$locale]}
      </span>
    </div>
  </header>
  <main class="flex-1">
    {@render children()}
  </main>
  <Footer />
</div>
