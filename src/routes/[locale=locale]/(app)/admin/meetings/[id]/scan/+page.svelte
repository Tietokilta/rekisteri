<script lang="ts">
  import type { PageProps } from "./$types";
  import { locale } from "$lib/i18n/i18n-svelte";
  import { onMount, onDestroy } from "svelte";
  import { Html5Qrcode } from "html5-qrcode";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import * as Alert from "$lib/components/ui/alert";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import { invalidateAll } from "$app/navigation";
  import Camera from "@lucide/svelte/icons/camera";
  import CameraOff from "@lucide/svelte/icons/camera-off";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import LogIn from "@lucide/svelte/icons/log-in";
  import LogOut from "@lucide/svelte/icons/log-out";

  const { data }: PageProps = $props();

  let scanner: Html5Qrcode | null = $state(null);
  let isScanning = $state(false);
  let lastScan: {
    success: boolean;
    eventType?: "CHECK_IN" | "CHECK_OUT";
    user?: { name: string; email: string };
    error?: string;
    message?: string;
  } | null = $state(null);

  // Clear last scan result after 5 seconds
  $effect(() => {
    if (lastScan) {
      const timeout = setTimeout(() => {
        lastScan = null;
      }, 5000);
      return () => clearTimeout(timeout);
    }
  });

  async function startScanning() {
    try {
      scanner = new Html5Qrcode("qr-reader");

      await scanner.start(
        { facingMode: "environment" }, // Use back camera
        {
          fps: 10, // Scan 10 times per second
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          // Stop scanner temporarily while processing
          if (scanner && isScanning) {
            await scanner.pause(true);
          }

          await handleScan(decodedText);

          // Resume scanning after 2 seconds
          setTimeout(async () => {
            if (scanner && isScanning) {
              await scanner.resume();
            }
          }, 2000);
        },
        () => {}, // Ignore scan errors (happens frequently)
      );

      isScanning = true;
    } catch (err) {
      console.error("Failed to start scanner:", err);
      lastScan = {
        success: false,
        error: "scanner_error",
        message: "Failed to start camera. Please check permissions.",
      };
    }
  }

  async function stopScanning() {
    if (scanner && isScanning) {
      try {
        await scanner.stop();
        scanner.clear();
        isScanning = false;
      } catch (err) {
        console.error("Failed to stop scanner:", err);
      }
    }
  }

  async function handleScan(token: string) {
    try {
      const response = await fetch(`/${$locale}/admin/meetings/${data.meeting.id}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        lastScan = await response.json();
        await invalidateAll();
      } else {
        lastScan = {
          success: false,
          error: "server_error",
          message: "Failed to process scan",
        };
      }
    } catch (err) {
      console.error("Scan error:", err);
      lastScan = {
        success: false,
        error: "network_error",
        message: "Network error occurred",
      };
    }
  }

  onMount(() => {
    // Auto-start scanning on mount
    startScanning();
  });

  onDestroy(() => {
    stopScanning();
  });
</script>

<main class="container mx-auto max-w-[800px] px-4 py-6">
  <AdminPageHeader title="QR Scanner" description={`Scanning for: ${data.meeting.name}`}>
    {#snippet actions()}
      <Button variant="outline" href="/{$locale}/admin/meetings/{data.meeting.id}">Back to meeting</Button>
    {/snippet}
  </AdminPageHeader>

  <!-- Scanner controls -->
  <Card.Root class="mb-6">
    <Card.Content class="pt-6">
      <div class="flex justify-center gap-4">
        {#if isScanning}
          <Button onclick={stopScanning} variant="destructive">
            <CameraOff class="mr-2 h-4 w-4" />
            Stop Camera
          </Button>
        {:else}
          <Button onclick={startScanning}>
            <Camera class="mr-2 h-4 w-4" />
            Start Camera
          </Button>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Scanner view -->
  <Card.Root class="mb-6">
    <Card.Content class="p-0">
      <div id="qr-reader" class="w-full"></div>
    </Card.Content>
  </Card.Root>

  <!-- Scan result -->
  {#if lastScan}
    <div class="fixed bottom-8 left-1/2 w-full max-w-md -translate-x-1/2 px-4">
      {#if lastScan.success}
        <Alert.Root class="border-green-500 bg-green-50">
          <CircleCheck class="h-5 w-5 text-green-600" />
          <Alert.Title class="flex items-center gap-2">
            {#if lastScan.eventType === "CHECK_IN"}
              <LogIn class="h-4 w-4" />
              Checked In
            {:else}
              <LogOut class="h-4 w-4" />
              Checked Out
            {/if}
          </Alert.Title>
          <Alert.Description>
            <div class="font-semibold">{lastScan.user?.name}</div>
            <div class="text-sm text-muted-foreground">{lastScan.user?.email}</div>
          </Alert.Description>
        </Alert.Root>
      {:else}
        <Alert.Root variant="destructive">
          <CircleX class="h-5 w-5" />
          <Alert.Title>
            {#if lastScan.error === "invalid_token"}
              Invalid QR Code
            {:else if lastScan.error === "no_membership"}
              No Active Membership
            {:else}
              Scan Failed
            {/if}
          </Alert.Title>
          <Alert.Description>
            {#if lastScan.user}
              <div class="font-semibold">{lastScan.user.name}</div>
              <div class="text-sm">{lastScan.user.email}</div>
            {/if}
            <div class="mt-1 text-sm">{lastScan.message}</div>
          </Alert.Description>
        </Alert.Root>
      {/if}
    </div>
  {/if}

  <!-- Instructions -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Instructions</Card.Title>
    </Card.Header>
    <Card.Content>
      <ul class="list-inside list-disc space-y-2 text-sm">
        <li>Point your camera at a member's QR code</li>
        <li>The scan will automatically check them in or out</li>
        <li>If already checked in, scanning again will check them out</li>
        <li>Only members with active membership can attend</li>
        <li>Scan results will show for 5 seconds</li>
      </ul>
    </Card.Content>
  </Card.Root>
</main>

<style>
  :global(#qr-reader) {
    border-radius: 0.5rem;
    overflow: hidden;
  }

  :global(#qr-reader video) {
    width: 100% !important;
    height: auto !important;
    border-radius: 0;
  }

  :global(#qr-reader__scan_region) {
    min-height: 300px;
  }
</style>
