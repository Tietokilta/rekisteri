<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import { LL } from "$lib/i18n/i18n-svelte";

  type Props = {
    token: string;
    userName: string;
  };

  let { token, userName }: Props = $props();

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

<button
  type="button"
  onclick={openModal}
  class="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
>
  {$LL.memberCard.show()}
</button>

<!-- Native HTML dialog element -->
<dialog bind:this={dialog} onclick={handleDialogClick} class="max-w-md rounded-lg backdrop:bg-black/80">
  <div class="flex flex-col items-center gap-6 p-8">
    <h2 class="text-center text-2xl font-bold">{$LL.memberCard.title()}</h2>

    <!-- QR Code -->
    {#if qrDataUrl}
      <div class="rounded-lg bg-white p-4 shadow-lg">
        <img src={qrDataUrl} alt={$LL.memberCard.qrAlt()} class="h-auto w-[280px]" />
      </div>
    {:else}
      <div class="h-[280px] w-[280px] animate-pulse rounded-lg bg-gray-200"></div>
    {/if}

    <!-- User name -->
    <p class="text-center text-xl font-semibold">{userName}</p>

    <!-- Close button -->
    <button
      type="button"
      onclick={closeModal}
      class="mt-4 rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 focus:outline-none"
    >
      {$LL.memberCard.close()}
    </button>
  </div>
</dialog>
