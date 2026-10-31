<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { LL } from "#lib/i18n/i18n-svelte.js";
  import type { AccountSwitchNotice } from "#lib/server/auth/account-switch-notice.js";
  import CircleCheck from "@lucide/svelte/icons/circle-check";

  let { notice }: { notice: AccountSwitchNotice } = $props();

  let dismissed = $state(false);
</script>

{#if !dismissed}
  <div
    class="flex gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
    role="status"
    data-testid="account-switch-notice"
  >
    <CircleCheck class="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
    <div class="flex-1 space-y-1">
      <p class="font-medium">{$LL.emailVerification.switched.title({ email: notice.accountEmail })}</p>
      <p>
        {notice.moved
          ? $LL.emailVerification.switched.moved({ email: notice.previousEmail })
          : $LL.emailVerification.switched.kept({ email: notice.previousEmail })}
      </p>
    </div>
    <Button variant="ghost" size="sm" class="-my-1 shrink-0" onclick={() => (dismissed = true)}>
      {$LL.emailVerification.switched.dismiss()}
    </Button>
  </div>
{/if}
