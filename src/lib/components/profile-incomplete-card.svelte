<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Button } from "$lib/components/ui/button";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import { withNext } from "$lib/utils/next";
  import User from "@lucide/svelte/icons/user";

  interface Props {
    title?: string;
    description?: string;
    // Where to continue after saving the profile
    next?: string;
  }

  let { title, description, next }: Props = $props();

  const profileHref = $derived(route("/[locale=locale]/settings/profile", { locale: $locale }));
</script>

<Card.Root>
  <Card.Content class="pt-6">
    <Empty.Root>
      <Empty.Media>
        <User class="size-12" />
      </Empty.Media>
      <Empty.Content>
        <Empty.Title>{title ?? $LL.dashboard.profileIncomplete()}</Empty.Title>
        <Empty.Description>{description ?? $LL.dashboard.profileIncompleteDescription()}</Empty.Description>
      </Empty.Content>
    </Empty.Root>
  </Card.Content>
  <Card.Footer>
    <Button href={next ? withNext(profileHref, next) : profileHref} class="w-full">
      {$LL.dashboard.completeProfile()}
    </Button>
  </Card.Footer>
</Card.Root>
