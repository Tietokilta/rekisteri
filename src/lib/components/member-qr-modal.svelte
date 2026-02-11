<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import QrCodeIcon from "@lucide/svelte/icons/qr-code";
  import { LL } from "$lib/i18n/i18n-svelte";
  import { Button } from "$lib/components/ui/button/index.js";

  type Props = {
    token: string;
    userName: string;
    class?: string;
  };

  let { token, userName, class: className }: Props = $props();

  let qrDataUrl = $state("");
  let wakeLock: WakeLockSentinel | null = $state(null);
  let dialog: HTMLDialogElement | null = $state(null);

  // Generate QR code when component mounts
  onMount(async () => {
    try {
      // Generate QR code as data URL
      // Token will be scanned by admin at meetings, events, etc.
      const url = token; // Just the token, admin scanner will decode it
      qrDataUrl = await QRCode.toDataURL(url, {
        width: 280,
        margin: 2,
        color: {
          dark: "#000000", // Black QR code
          light: "#FFFFFF", // White background (high contrast)
        },
      });
    } catch (err) {
      console.error("Failed to generate QR code:", err);
    }
  });

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

  function closeModal() {
    if (!dialog) return;

    // Release wake lock when modal closes
    if (wakeLock) {
      wakeLock.release().catch((err) => {
        console.error("Wake Lock release error:", err);
      });
      wakeLock = null;
    }

    dialog.close();
  }

  // Close on backdrop click
  function handleDialogClick(e: MouseEvent) {
    if (e.target === dialog) {
      closeModal();
    }
  }
</script>

<Button onclick={openModal} class={className}>
  <QrCodeIcon class="mr-2 size-4" />
  {$LL.memberCard.show()}
</Button>

<!-- Native HTML dialog element -->
<dialog bind:this={dialog} onclick={handleDialogClick} class="fixed m-auto max-w-md rounded-lg backdrop:bg-black/80">
  <div class="flex flex-col items-center gap-6 p-8">
    <h2 class="text-center text-2xl font-bold">{$LL.memberCard.title()}</h2>

    <!-- QR Code -->
    {#if qrDataUrl}
      <div class="rounded-lg bg-white p-4 shadow-lg">
        <img src={qrDataUrl} alt={$LL.memberCard.qrAlt()} class="h-auto w-70" />
      </div>
    {:else}
      <div class="h-70 w-70 animate-pulse rounded-lg bg-gray-200"></div>
    {/if}

    <!-- User name -->
    <p class="text-center text-xl font-semibold">{userName}</p>

    <!-- Close button -->
    <Button onclick={closeModal} class="mt-4">
      {$LL.memberCard.close()}
    </Button>
  </div>
</dialog>
