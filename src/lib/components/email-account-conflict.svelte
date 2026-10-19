<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
  import { LL } from "$lib/i18n/i18n-svelte";
  import WrapTranslation from "$lib/components/wrap-translation.svelte";
  import { switchToEmailAccount } from "$lib/api/email-verification.remote";

  interface Props {
    // The code the user just entered; proves they control the address
    code: string;
    // Where to continue after signing in to the other account
    next?: string;
    // Label for the secondary action, e.g. "Use another aalto.fi email"
    useAnotherLabel: string;
    onUseAnother: () => void;
  }

  let { code, next, useAnotherLabel, onUseAnother }: Props = $props();

  const contactEmail = $derived(page.data.customizations?.overseerContact);
</script>

<div class="space-y-3 rounded-lg border border-l-4 border-l-amber-500 p-4" data-testid="email-account-conflict">
  <div class="space-y-1">
    <p class="font-medium">{$LL.emailVerification.conflict.title()}</p>
    <p class="text-sm text-muted-foreground">{$LL.emailVerification.conflict.description()}</p>
  </div>

  <form {...switchToEmailAccount} class="contents">
    <input type="hidden" name="code" value={code} />
    {#if next}<input type="hidden" name="next" value={next} />{/if}
    <Button type="submit" class="w-full" disabled={!!switchToEmailAccount.pending}>
      {$LL.emailVerification.conflict.signIn()}
    </Button>
  </form>
  {#each switchToEmailAccount.fields.allIssues() as issue, i (i)}
    <p class="text-sm text-destructive">{issue.message}</p>
  {/each}

  <Button type="button" variant="outline" class="w-full" onclick={onUseAnother}>{useAnotherLabel}</Button>

  {#if contactEmail}
    <p class="text-xs text-muted-foreground">
      <WrapTranslation message={$LL.emailVerification.conflict.contactBoard({ email: contactEmail })}>
        {#snippet children(infix)}
          <a href="mailto:{contactEmail}" class="underline underline-offset-2">{infix}</a>
        {/snippet}
      </WrapTranslation>
    </p>
  {/if}
</div>
