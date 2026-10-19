<script lang="ts">
  import { page } from "$app/state";
  import { PersistedState } from "runed";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import { withNext } from "$lib/utils/next";

  interface Props {
    userId: string;
    domain: string;
  }

  let { userId, domain }: Props = $props();

  const dismissed = $derived(new PersistedState(`personalEmailPromptDismissed:${userId}`, false));
  const addHref = $derived(
    withNext(route("/[locale=locale]/settings/emails/add", { locale: $locale }), page.url.pathname + page.url.search),
  );
</script>

{#if !dismissed.current}
  <Card.Root data-testid="personal-email-prompt">
    <Card.Header>
      <Card.Title>{$LL.emailVerification.personalEmail.title()}</Card.Title>
      <Card.Description>{$LL.emailVerification.personalEmail.description({ domain })}</Card.Description>
    </Card.Header>
    <Card.Footer class="flex gap-2">
      <Button href={addHref} class="flex-1">{$LL.emailVerification.personalEmail.add()}</Button>
      <Button variant="outline" class="flex-1" onclick={() => (dismissed.current = true)}>
        {$LL.emailVerification.personalEmail.later()}
      </Button>
    </Card.Footer>
  </Card.Root>
{/if}
