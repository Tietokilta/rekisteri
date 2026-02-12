<script lang="ts">
  import { onDestroy } from "svelte";
  import QrCodeIcon from "@lucide/svelte/icons/qr-code";
  import { LL } from "$lib/i18n/i18n-svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import QrImage from "$lib/components/qr-image.svelte";

  type Props = {
    token: string;
    userName: string;
    class?: string;
  };

  let { token, userName, class: className }: Props = $props();

  let wakeLock: WakeLockSentinel | null = $state(null);
  let dialog: HTMLDialogElement | null = $state(null);

  async function openModal() {
    if (!dialog) return;

    dialog.showModal();

    // Request wake lock to keep screen on
    if ("wakeLock" in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch (err) {
        console.error("Wake Lock error:", err);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch((err) => {
        console.error("Wake Lock release error:", err);
      });
      wakeLock = null;
    }
  }

  function closeModal() {
    if (!dialog) return;
    dialog.close();
  }

  onDestroy(() => {
    releaseWakeLock();
  });
</script>

<Button onclick={openModal} class={className}>
  <QrCodeIcon class="mr-2 size-4" />
  {$LL.memberCard.show()}
</Button>

<!-- Native HTML dialog element -->
<dialog
  bind:this={dialog}
  onclose={releaseWakeLock}
  onclick={(e) => {
    if (e.target === dialog) dialog?.close();
  }}
  class="fixed m-auto max-w-md rounded-lg backdrop:bg-black/80"
>
  <div class="flex flex-col items-center gap-6 p-8">
    <h2 class="text-center text-2xl font-bold">{$LL.memberCard.title()}</h2>

    <!-- QR Code -->
    <svelte:boundary>
      <QrImage {token} />
      {#snippet pending()}
        <div class="h-70 w-70 animate-pulse rounded-lg bg-gray-200"></div>
      {/snippet}
      {#snippet failed(_error, retry)}
        <div class="flex h-70 w-70 flex-col items-center justify-center gap-2 rounded-lg bg-gray-100">
          <p class="text-sm text-destructive">Failed to generate QR code</p>
          <Button onclick={retry} variant="outline" size="sm">Retry</Button>
        </div>
      {/snippet}
    </svelte:boundary>

    <!-- User name -->
    <p class="text-center text-xl font-semibold">{userName}</p>

    <!-- Close button -->
    <Button onclick={closeModal} class="mt-4">
      {$LL.memberCard.close()}
    </Button>
  </div>
</dialog>
