<script lang="ts">
  import { tick } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { REGEXP_ONLY_DIGITS_AND_CHARS } from "bits-ui";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as InputOTP from "$lib/components/ui/input-otp/index.js";
  import EmailAccountConflict from "$lib/components/email-account-conflict.svelte";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { formatDate } from "$lib/utils";
  import { sendStudentEmailCode, verifyStudentEmailCode } from "$lib/api/email-verification.remote";
  import CircleCheck from "@lucide/svelte/icons/circle-check";

  interface Props {
    domain: string;
    // Currently valid address on this domain, if any
    verifiedEmail: string | null;
    verifiedUntil: Date | null;
    // Address whose verification has expired, if any
    expiredEmail: string | null;
    expiredAt: Date | null;
    // Where to continue after signing in to another account
    next: string;
  }

  let { domain, verifiedEmail, verifiedUntil, expiredEmail, expiredAt, next }: Props = $props();

  let step = $state<"email" | "code" | "conflict">("email");
  let sentTo = $state("");
  let code = $state("");
  let codeResent = $state(false);
  let verifyFormEl = $state<HTMLFormElement>();

  function restart() {
    step = "email";
    code = "";
    codeResent = false;
  }

  async function handleComplete() {
    await tick();
    verifyFormEl?.requestSubmit();
  }
</script>

{#if verifiedEmail}
  <div
    class="flex gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
    data-testid="student-email-verified"
  >
    <CircleCheck class="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
    <div>
      <p>{$LL.emailVerification.verified({ email: verifiedEmail })}</p>
      {#if verifiedUntil}
        <p>{$LL.emailVerification.validUntil({ date: formatDate(new Date(verifiedUntil), $locale) })}</p>
      {/if}
    </div>
  </div>
{:else if step === "conflict"}
  <EmailAccountConflict
    {code}
    {next}
    useAnotherLabel={$LL.emailVerification.conflict.useAnotherDomain({ domain })}
    onUseAnother={restart}
  />
{:else}
  <div class="space-y-3 rounded-lg border border-l-4 border-l-primary p-4" data-testid="student-email-verification">
    {#if step === "email"}
      <div class="space-y-1">
        <p class="font-medium">
          {expiredEmail ? $LL.emailVerification.reverifyTitle({ domain }) : $LL.emailVerification.title({ domain })}
        </p>
        {#if expiredAt}
          <p class="text-sm text-muted-foreground">
            {$LL.emailVerification.expired({ date: formatDate(new Date(expiredAt), $locale) })}
          </p>
        {/if}
      </div>
      <form
        {...sendStudentEmailCode.enhance(async ({ submit }) => {
          await submit();
          const sent = sendStudentEmailCode.result?.email;
          if (!sent) return;
          sentTo = sent;
          code = "";
          step = "code";
        })}
        class="space-y-3"
      >
        <div class="space-y-2">
          <Label for="student-email">{$LL.emailVerification.emailLabel({ domain })}</Label>
          <Input
            {...sendStudentEmailCode.fields.email.as("email")}
            id="student-email"
            value={sendStudentEmailCode.fields.email.value() ?? expiredEmail ?? ""}
            placeholder={$LL.emailVerification.emailPlaceholder({ domain })}
            autocomplete="email"
            autocapitalize="none"
            autocorrect="off"
          />
          {#each sendStudentEmailCode.fields.email.issues() as issue, i (i)}
            <p class="text-sm text-destructive">{issue.message}</p>
          {/each}
        </div>
        <Button type="submit" class="w-full" disabled={!!sendStudentEmailCode.pending}>
          {$LL.emailVerification.sendCode()}
        </Button>
      </form>
    {:else}
      <div class="space-y-1">
        <p class="font-medium">{$LL.emailVerification.enterCode()}</p>
        <p class="text-sm text-muted-foreground">{$LL.emailVerification.codeSent({ email: sentTo })}</p>
      </div>
      <form
        bind:this={verifyFormEl}
        {...verifyStudentEmailCode.enhance(async ({ submit }) => {
          await submit();
          const result = verifyStudentEmailCode.result;
          if (result?.status === "verified") {
            await invalidateAll();
          } else if (result?.status === "conflict") {
            step = "conflict";
          }
        })}
        class="space-y-3"
      >
        <div class="space-y-2">
          <Label for="student-email-code">{$LL.emailVerification.code()}</Label>
          <InputOTP.Root
            id="student-email-code"
            maxlength={8}
            pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
            inputmode="text"
            name="code"
            bind:value={code}
            required
            class="capitalize"
            data-testid="student-email-otp"
            onComplete={handleComplete}
          >
            {#snippet children({ cells })}
              <InputOTP.Group>
                {#each cells as cell, i (i)}
                  <InputOTP.Slot {cell} class="h-10 w-8 sm:w-10" />
                {/each}
              </InputOTP.Group>
            {/snippet}
          </InputOTP.Root>
          {#each verifyStudentEmailCode.fields.allIssues() as issue, i (i)}
            <p class="text-sm text-destructive">{issue.message}</p>
          {/each}
        </div>
        <Button type="submit" class="w-full" disabled={!!verifyStudentEmailCode.pending}>
          {$LL.emailVerification.verify()}
        </Button>
      </form>
      <div class="flex justify-between gap-2 text-sm">
        <button type="button" class="underline underline-offset-4" onclick={restart}>
          {$LL.emailVerification.changeEmail()}
        </button>
        <form
          {...sendStudentEmailCode.enhance(async ({ submit }) => {
            await submit();
            codeResent = true;
          })}
        >
          <input type="hidden" name="email" value={sentTo} />
          <button type="submit" class="underline underline-offset-4" disabled={!!sendStudentEmailCode.pending}>
            {$LL.emailVerification.resendCode()}
          </button>
        </form>
      </div>
      {#if codeResent}
        <p class="text-sm text-muted-foreground">{$LL.emailVerification.codeResent()}</p>
      {/if}
    {/if}
  </div>
{/if}
