<script lang="ts">
  import type { PageData } from "./$types";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { Button } from "$lib/components/ui/button";
  import ShieldAlert from "@lucide/svelte/icons/shield-alert";
  import { route } from "$lib/ROUTES";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{$LL.app.title()} - {data.title}</title>
</svelte:head>

<div class="my-auto flex w-full items-center justify-center p-4 py-12">
  <div class="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-lg sm:p-8">
    <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
      <ShieldAlert class="size-7" />
    </div>

    <h1 class="mt-4 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
      {data.title}
    </h1>

    <p class="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
      {data.description}
    </p>

    {#if data.code}
      <div
        class="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
      >
        <span>{$LL.oidc.error.errorCode()}:</span>
        <span class="font-semibold text-foreground">{data.code}</span>
      </div>
    {/if}

    <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
      <Button href={route("/[locale=locale]", { locale: $locale })} class="w-full sm:w-auto">
        {$LL.error.backToHome()}
      </Button>
    </div>
  </div>
</div>
