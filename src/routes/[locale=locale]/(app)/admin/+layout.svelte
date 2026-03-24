<script lang="ts">
  import type { LayoutProps } from "./$types";
  import { LL } from "$lib/i18n/i18n-svelte";
  import * as Alert from "$lib/components/ui/alert";
  import Eye from "@lucide/svelte/icons/eye";

  const { data, children }: LayoutProps = $props();
</script>

{#if !data.canWrite}
  <div class="container mx-auto max-w-[1400px] px-4 pt-4">
    <Alert.Root variant="default">
      <Eye class="size-4" />
      <Alert.Title class="sr-only">{$LL.admin.users.table.roleReadonly()}</Alert.Title>
      <Alert.Description>{$LL.admin.readonlyBanner()}</Alert.Description>
    </Alert.Root>
  </div>
{/if}

{@render children()}
