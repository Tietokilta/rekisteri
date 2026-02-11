<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import X from "@lucide/svelte/icons/x";
  import { LL } from "$lib/i18n/i18n-svelte";
  import { cn } from "$lib/utils";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { verifyQr } from "./data.remote";

  let scanning = $state(false);
  let processing = $state(false);
  let error = $state("");
  let qrScanner: { stop(): Promise<void>; clear(): void } | null = null;

  type VerifyResult = Awaited<ReturnType<typeof verifyQr>>;

  let scannedUser = $state<VerifyResult | null>(null);
  let dialog: HTMLDialogElement | null = $state(null);

  let scanStatus = $derived(scannedUser ? getOverallStatus(scannedUser.memberships) : "none");

  // Status styling matching membership-card.svelte patterns
  const statusConfig = $derived.by(() => {
    switch (scanStatus) {
      case "active":
        return {
          icon: CircleCheck,
          badgeVariant: "default" as const,
          borderClass: "border-green-500/50",
          bgClass: "bg-green-500/5",
          iconClass: "text-green-500",
        };
      case "expired":
        return {
          icon: CircleAlert,
          badgeVariant: "secondary" as const,
          borderClass: "border-yellow-500/50",
          bgClass: "bg-yellow-500/5",
          iconClass: "text-yellow-500",
        };
      default:
        return {
          icon: CircleX,
          badgeVariant: "outline" as const,
          borderClass: "border-muted",
          bgClass: "bg-muted",
          iconClass: "text-muted-foreground",
        };
    }
  });

  async function startScanning() {
    error = "";
    scanning = true;
    processing = false;

    await tick();

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      qrScanner = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {},
      );
    } catch {
      error = $LL.admin.verifyQr.cameraError();
      scanning = false;
    }
  }

  async function stopScanning() {
    if (qrScanner) {
      try {
        await qrScanner.stop();
        qrScanner.clear();
      } catch {
        // Ignore cleanup errors
      }
      qrScanner = null;
    }
    scanning = false;
  }

  async function onScanSuccess(decodedText: string) {
    if (processing) return;
    processing = true;

    await stopScanning();

    try {
      scannedUser = await verifyQr({ token: decodedText });
      dialog?.showModal();
    } catch {
      error = $LL.admin.verifyQr.verifyError();
      processing = false;
    }
  }

  function closeAndScanNext() {
    dialog?.close();
    startScanning();
  }

  onDestroy(() => {
    stopScanning();
  });

  function getOverallStatus(memberships: VerifyResult["memberships"]): "active" | "expired" | "none" {
    if (memberships.some((m) => m.status === "active")) return "active";
    if (memberships.some((m) => m.status === "expired")) return "expired";
    return "none";
  }

  function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString();
  }
</script>

<main class="container mx-auto max-w-350 px-4 py-6">
  <AdminPageHeader title={$LL.admin.verifyQr.title()} description={$LL.admin.verifyQr.description()} />

  <div class="mx-auto max-w-2xl space-y-6">
    <div class="flex justify-center">
      {#if !scanning}
        <Button onclick={startScanning} size="lg">{$LL.admin.verifyQr.startScanning()}</Button>
      {/if}
    </div>

    {#if error && !scanning}
      <div class="rounded-md border border-destructive bg-destructive/10 p-4 text-center text-destructive">
        {error}
      </div>
    {/if}
  </div>
</main>

{#if scanning}
  <div class="fixed inset-0 z-60 flex flex-col items-center justify-center bg-black">
    <div id="qr-reader" class="w-full max-w-2xl overflow-hidden"></div>

    {#if error}
      <div
        class="absolute right-4 bottom-32 left-4 rounded-md border border-destructive bg-destructive/10 p-4 text-center text-destructive"
      >
        {error}
      </div>
    {/if}

    <div class="absolute bottom-6 flex flex-col items-center gap-3">
      <p class="text-center text-sm text-white">
        {$LL.admin.verifyQr.scanInstructions()}
      </p>
      <button
        onclick={stopScanning}
        class="rounded-full bg-white/15 p-3 text-white hover:bg-white/25"
        aria-label={$LL.admin.verifyQr.closeScanner()}
      >
        <X class="h-8 w-8" />
      </button>
    </div>
  </div>
{/if}

<!-- Scan result dialog -->
<dialog
  bind:this={dialog}
  onclose={() => {
    scannedUser = null;
    processing = false;
  }}
  onclick={(e) => {
    if (e.target === dialog) dialog?.close();
  }}
  class={cn(
    "fixed m-auto w-full max-w-md rounded-2xl border-4 bg-background p-0 text-foreground backdrop:bg-black/60",
    statusConfig.borderClass,
  )}
>
  {#if scannedUser}
    {@const Icon = statusConfig.icon}

    <!-- Status banner -->
    <div class={cn("flex flex-col items-center gap-3 p-6 pb-4", statusConfig.bgClass)}>
      <Icon class={cn("h-16 w-16", statusConfig.iconClass)} />

      <div class="text-center">
        <div class="text-2xl font-bold">
          {scannedUser.user.firstNames || ""}
          {scannedUser.user.lastName || ""}
        </div>
        <div class="text-sm text-muted-foreground">{scannedUser.user.email}</div>
      </div>

      <Badge variant={statusConfig.badgeVariant} class="px-4 py-1 text-base">
        {#if scanStatus === "active"}
          {$LL.membership.status.active()}
        {:else if scanStatus === "expired"}
          {$LL.membership.status.expired()}
        {:else}
          {$LL.admin.verifyQr.noMemberships()}
        {/if}
      </Badge>
    </div>

    <!-- Membership details -->
    {#if scannedUser.memberships.length > 0}
      <div class="space-y-2 px-6 py-4">
        {#each scannedUser.memberships as membership (membership.id)}
          <div class="rounded-lg border p-3">
            <div class="font-medium">{membership.membershipType.name.fi}</div>
            <div class="text-sm text-muted-foreground">
              {formatDate(membership.membership.startTime)} – {formatDate(membership.membership.endTime)}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex gap-3 p-6 pt-2">
      <Button onclick={() => dialog?.close()} variant="outline" class="flex-1">{$LL.common.cancel()}</Button>
      <Button onclick={closeAndScanNext} class="flex-1">{$LL.admin.verifyQr.scanNext()}</Button>
    </div>
  {/if}
</dialog>
