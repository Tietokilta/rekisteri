<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { LL } from "$lib/i18n/i18n-svelte";
  import { signIn } from "./data.remote";
  import { signInSchema } from "./schema";
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
  <h1 class="font-mono text-lg">{$LL.auth.signInOrCreateAccount()}</h1>
  <p class="max-w-xs text-center text-sm text-balance text-muted-foreground">{$LL.auth.signInDescription()}</p>
  <form {...signIn.preflight(signInSchema)} class="flex w-full max-w-xs flex-col gap-4">
    <p>
      <Label for="email">{$LL.auth.email()}</Label>
      <Input
        {...signIn.fields.email.as("email")}
        id="email"
        autocomplete="email"
        autocapitalize="none"
        autocorrect="off"
        placeholder="example@tietokilta.fi"
        required
      />
    </p>
    <Button type="submit">{$LL.auth.continue()}</Button>
  </form>
  {#each signIn.fields.allIssues() as issue, i (i)}
    <p style="color: red">{issue.message}</p>
  {/each}
</main>
