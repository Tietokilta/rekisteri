<script lang="ts">
  import { page } from "$app/state";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";

  const is404 = $derived(page.status === 404);
  const is5xx = $derived(page.status >= 500 && page.status < 600);
</script>

<div class="container mx-auto flex min-h-[calc(100svh-14rem)] max-w-2xl items-center justify-center px-4 py-12">
  <Card.Root class="w-full">
    <Card.Header class="text-center">
      <div class="mb-4 text-6xl font-bold text-muted-foreground">
        {page.status}
      </div>
      <Card.Title class="text-2xl">
        {#if is404}
          {$LL.error.notFound()}
        {:else if is5xx}
          {$LL.error.serverError()}
        {:else}
          {$LL.error.genericError()}
        {/if}
      </Card.Title>
      <Card.Description class="mt-2 text-base">
        {#if is404}
          {$LL.error.notFoundDescription()}
        {:else if page.error?.message}
          {page.error.message}
        {:else}
          {$LL.error.title()}
        {/if}
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col items-center gap-4">
      <div class="flex flex-col gap-2 sm:flex-row">
        <Button href={route("/[locale=locale]", { locale: $locale })} variant="default">
          {$LL.error.backToHome()}
        </Button>
        {#if !is404}
          <Button onclick={() => globalThis.location.reload()} variant="outline">
            {$LL.error.tryAgain()}
          </Button>
        {/if}
      </div>
      {#if import.meta.env.DEV && page.error?.message}
        <details class="mt-4 w-full">
          <summary class="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            {$LL.error.errorCode({ code: String(page.status) })}
          </summary>
          <pre class="mt-2 overflow-auto rounded-lg bg-muted p-4 text-xs">{JSON.stringify(page.error, null, 2)}</pre>
        </details>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
