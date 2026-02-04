<script lang="ts">
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { page } from "$app/stores";
  import { route } from "$lib/ROUTES";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { addSecondaryEmailForm } from "$lib/api/secondary-emails.remote";
  import { addSecondaryEmailSchema } from "$lib/api/secondary-emails.schema";

  const next = $derived($page.url.searchParams.get("next") ?? "");

  // Track if form has been validated (after first blur or submit attempt)
  let hasValidated = $state(false);

  function handleBlur() {
    hasValidated = true;
    // validate() may reject if the form unmounts during navigation (e.g. after submit redirect)
    addSecondaryEmailForm.validate().catch(() => {});
  }

  function handleInput() {
    // Only validate on input after initial validation (reward early, validate late)
    if (hasValidated) {
      addSecondaryEmailForm.validate().catch(() => {});
    }
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{$LL.secondaryEmail.addEmail()}</Card.Title>
  </Card.Header>
  <Card.Content>
    <Alert.Root class="mb-4">
      <Alert.Description>{$LL.secondaryEmail.infoExpiring()}</Alert.Description>
    </Alert.Root>

    <form {...addSecondaryEmailForm.preflight(addSecondaryEmailSchema)} class="space-y-4">
      {#if next}<input type="hidden" name="next" value={next} />{/if}
      <div class="space-y-2">
        <Label for="email">{$LL.secondaryEmail.emailAddress()}</Label>
        <Input
          {...addSecondaryEmailForm.fields.email.as("email")}
          id="email"
          placeholder={$LL.secondaryEmail.emailPlaceholder()}
          autocomplete="email"
          autocapitalize="none"
          autocorrect="off"
          onblur={handleBlur}
          oninput={handleInput}
        />
        {#each addSecondaryEmailForm.fields.email.issues() as issue, i (i)}
          <p class="text-sm text-destructive" data-testid="add-email-error">{issue.message}</p>
        {/each}
      </div>

      <Button type="submit" class="w-full" data-testid="submit-add-email">
        {$LL.secondaryEmail.addAndVerify()}
      </Button>

      <Button
        variant="outline"
        href={`${route("/[locale=locale]/settings/emails", { locale: $locale })}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
        class="w-full"
      >
        {$LL.auth.passkey.cancel()}
      </Button>
    </form>
  </Card.Content>
</Card.Root>
