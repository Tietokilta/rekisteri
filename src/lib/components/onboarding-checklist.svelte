<script lang="ts">
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LL, locale } from "#lib/i18n/i18n-svelte.js";
  import { route } from "#lib/ROUTES.js";
  import { withNext } from "#lib/utils/next.js";
  import Check from "@lucide/svelte/icons/check";

  interface Props {
    isProfileComplete: boolean;
  }

  let { isProfileComplete }: Props = $props();

  const newMembershipHref = $derived(route("/[locale=locale]/new", { locale: $locale }));
  const profileHref = $derived(route("/[locale=locale]/settings/profile", { locale: $locale }));

  // Index of the step the user should do next: details first, then membership
  const currentStep = $derived(isProfileComplete ? 1 : 0);

  const steps = $derived([
    { title: $LL.dashboard.onboarding.detailsTitle(), description: $LL.dashboard.onboarding.detailsDescription() },
    {
      title: $LL.dashboard.onboarding.membershipTitle(),
      description: $LL.dashboard.onboarding.membershipDescription(),
    },
    { title: $LL.dashboard.onboarding.paymentTitle(), description: null },
    { title: $LL.dashboard.onboarding.decisionTitle(), description: $LL.dashboard.onboarding.decisionDescription() },
  ]);
</script>

<Card.Root data-testid="onboarding-checklist">
  <Card.Header>
    <Card.Title>{$LL.dashboard.onboarding.title()}</Card.Title>
  </Card.Header>
  <Card.Content>
    <ol class="divide-y">
      {#each steps as step, i (i)}
        {@const isDone = i < currentStep}
        {@const isCurrent = i === currentStep}
        <li class="flex gap-3 py-3 first:pt-0 last:pb-0" aria-current={isCurrent ? "step" : undefined}>
          <span
            class={[
              "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-medium",
              isDone && "border-green-600 bg-green-600/15 text-green-600 dark:border-green-500 dark:text-green-400",
              isCurrent && "border-primary bg-primary text-primary-foreground",
              !isDone && !isCurrent && "text-muted-foreground",
            ]}
          >
            {#if isDone}
              <Check class="size-4" />
              <span class="sr-only">{$LL.dashboard.onboarding.done()}</span>
            {:else}
              {i + 1}
            {/if}
          </span>
          <div class="min-w-0 flex-1 space-y-1">
            <p class={["font-medium", !isDone && !isCurrent && "text-muted-foreground"]}>{step.title}</p>
            {#if step.description}
              <p class="text-sm text-muted-foreground">{step.description}</p>
            {/if}
            {#if i === 0 && isDone}
              <a href={profileHref} class="text-sm underline underline-offset-4 hover:text-primary/80">
                {$LL.dashboard.onboarding.detailsEdit()}
              </a>
            {:else if i === 0 && isCurrent}
              <Button href={withNext(profileHref, newMembershipHref)} class="mt-2 w-full">
                {$LL.dashboard.onboarding.detailsAction()}
              </Button>
            {:else if i === 1 && isCurrent}
              <Button href={newMembershipHref} class="mt-2 w-full">
                {$LL.dashboard.onboarding.membershipAction()}
              </Button>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  </Card.Content>
</Card.Root>
