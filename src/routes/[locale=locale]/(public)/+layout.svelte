<script lang="ts">
  import { locale } from "$lib/i18n/i18n-svelte";
  import { page } from "$app/state";
  import LanguageToggle from "$lib/components/language-toggle.svelte";
  import { route } from "$lib/ROUTES";
  import Footer from "$lib/components/footer.svelte";

  let { children }: { children: import("svelte").Snippet } = $props();

  const logoUrl = $derived(page.data.customizations.logoUrl ?? page.data.customizations.logoDarkUrl);
  const logoDarkUrl = $derived(page.data.customizations.logoDarkUrl ?? page.data.customizations.logoUrl);
</script>

<div class="relative flex min-h-svh flex-col bg-background">
  <header
    class="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60"
  >
    <div class="mx-auto w-full max-w-[1400px]">
      <div class="container mx-auto flex h-14 items-center justify-between gap-2 px-4 md:gap-4">
        <a href={route("/[locale=locale]", { locale: $locale })} class="flex items-center gap-2">
          {#if logoUrl || logoDarkUrl}
            <img src={logoUrl} alt="App logo" class="h-12 w-12 dark:hidden" />
            <img src={logoDarkUrl} alt="App logo" class="hidden h-12 w-12 dark:block" />
          {/if}
          <span class="sr-only font-mono font-medium sm:not-sr-only sm:text-xl"
            >{page.data.customizations.appName[$locale]}</span
          >
        </a>
        <LanguageToggle lowercase />
      </div>
    </div>
  </header>
  <main class="flex-1">
    {@render children()}
  </main>
  <Footer />
</div>
