<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LL } from "#lib/i18n/i18n-svelte.js";
  import WrapTranslation from "#lib/components/wrap-translation.svelte";
  import { switchToEmailAccount } from "#lib/api/email-verification.remote.js";

  interface Props {
    // The code the user just entered; proves they control the address
    code: string;
    // Where to continue after signing in to the other account
    next?: string;
    // The code expired; ask for the new one, or start over if none was sent
    onCodeExpired: (resent: boolean) => void;
  }

  let { code, next, onCodeExpired }: Props = $props();

  const contactEmail = $derived(page.data.customizations?.overseerContact);
</script>

<div class="space-y-3 rounded-lg border p-4" data-testid="email-account-conflict">
  <div class="space-y-1">
    <p class="font-medium">{$LL.emailVerification.conflict.title()}</p>
    <p class="text-sm text-muted-foreground">{$LL.emailVerification.conflict.description()}</p>
  </div>

  <form
    {...switchToEmailAccount.enhance(async ({ submit }) => {
      await submit();
      const result = switchToEmailAccount.result;
      if (result?.expired) {
        onCodeExpired(result.resent);
      }
    })}
  >
    <input {...switchToEmailAccount.fields.code.as("hidden", code)} />
    {#if next}<input {...switchToEmailAccount.fields.next.as("hidden", next)} />{/if}
    <Button type="submit" class="w-full" disabled={!!switchToEmailAccount.pending}>
      {$LL.emailVerification.conflict.signIn()}
    </Button>
  </form>
  {#each switchToEmailAccount.fields.allIssues() as issue, i (i)}
    <p class="text-sm text-destructive">{issue.message}</p>
  {/each}

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
