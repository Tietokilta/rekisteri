<script lang="ts">
  import { page } from "$app/state";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LL, locale } from "#lib/i18n/i18n-svelte.js";
  import { route } from "#lib/ROUTES.js";
  import { withNext } from "#lib/utils/next.js";
  import { dismissPersonalEmailPrompt } from "#lib/api/secondary-emails.remote.js";

  let { domain }: { domain: string } = $props();

  const addHref = $derived(
    withNext(route("/[locale=locale]/settings/emails/add", { locale: $locale }), page.url.pathname + page.url.search),
  );
</script>

<Card.Root data-testid="personal-email-prompt">
  <Card.Header>
    <Card.Title>{$LL.emailVerification.personalEmail.title()}</Card.Title>
    <Card.Description>{$LL.emailVerification.personalEmail.description({ domain })}</Card.Description>
  </Card.Header>
  <Card.Footer class="flex gap-2">
    <Button href={addHref} variant="outline" class="flex-1">{$LL.emailVerification.personalEmail.add()}</Button>
    <form {...dismissPersonalEmailPrompt} class="flex flex-1">
      <Button type="submit" variant="ghost" class="flex-1" disabled={!!dismissPersonalEmailPrompt.pending}>
        {$LL.emailVerification.personalEmail.later()}
      </Button>
    </form>
  </Card.Footer>
</Card.Root>
