<script lang="ts">
  import { onDestroy } from "svelte";
  import jsQR from "jsqr";
  import { LL } from "$lib/i18n/i18n-svelte";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import type { LocalizedString } from "$lib/server/db/schema";

  let videoElement: HTMLVideoElement | null = $state(null);
  let canvasElement: HTMLCanvasElement | null = $state(null);
  let stream: MediaStream | null = $state(null);
  let scanning = $state(false);
  let error = $state("");

  // Scanned user data
  let scannedUser: {
    user: {
      id: string;
      email: string;
      firstNames: string | null;
      lastName: string | null;
      homeMunicipality: string | null;
    };
    memberships: Array<{
      id: string;
      status: string;
      createdAt: Date;
      membershipType: {
        id: string;
        name: LocalizedString;
      };
      membership: {
        startTime: Date;
        endTime: Date;
      };
    }>;
  } | null = $state(null);

  let dialog: HTMLDialogElement | null = $state(null);

  async function startScanning() {
    error = "";
    scanning = true;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      if (videoElement) {
        videoElement.srcObject = stream;
        await videoElement.play();
        requestAnimationFrame(scanFrame);
      }
    } catch {
      error = $LL.admin.verifyQr.cameraError();
      scanning = false;
    }
  }

  function stopScanning() {
    scanning = false;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      stream = null;
    }
  }

  function scanFrame() {
    if (!scanning || !videoElement || !canvasElement) return;

    const canvas = canvasElement;
    const video = videoElement;
    const context = canvas.getContext("2d");

    if (!context) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

      // Use jsQR to scan for QR code
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        verifyToken(code.data);
        return;
      }
    }

    requestAnimationFrame(scanFrame);
  }

  async function verifyToken(token: string) {
    stopScanning();

    try {
      const response = await fetch(globalThis.location.href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        error = response.status === 404 ? $LL.admin.verifyQr.invalidQr() : $LL.admin.verifyQr.verifyError();
        return;
      }

      scannedUser = await response.json();
      dialog?.showModal();
    } catch {
      error = $LL.admin.verifyQr.verifyError();
    }
  }

  function closeModal() {
    dialog?.close();
    scannedUser = null;
  }

  onDestroy(() => {
    stopScanning();
  });

  function getStatusBadge(status: string): "default" | "secondary" | "destructive" | "outline" {
    if (status === "active") return "default";
    if (status === "expired") return "secondary";
    return "outline";
  }

  function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString();
  }
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
  <AdminPageHeader title={$LL.admin.verifyQr.title()} description={$LL.admin.verifyQr.description()} />

  <div class="mx-auto max-w-2xl space-y-6">
    <!-- Scanner controls -->
    <div class="flex justify-center">
      {#if !scanning}
        <Button onclick={startScanning} size="lg">{$LL.admin.verifyQr.startScanning()}</Button>
      {:else}
        <Button onclick={stopScanning} variant="destructive" size="lg">{$LL.admin.verifyQr.stopScanning()}</Button>
      {/if}
    </div>

    <!-- Error message -->
    {#if error}
      <div class="rounded-md border border-destructive bg-destructive/10 p-4 text-center text-destructive">
        {error}
      </div>
    {/if}

    <!-- Video feed -->
    {#if scanning}
      <div class="relative overflow-hidden rounded-lg border bg-black">
        <video bind:this={videoElement} class="w-full" playsinline></video>
        <canvas bind:this={canvasElement} class="hidden"></canvas>
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="h-48 w-48 rounded-lg border-4 border-primary opacity-50"></div>
        </div>
      </div>
      <p class="text-center text-sm text-muted-foreground">{$LL.admin.verifyQr.scanInstructions()}</p>
    {/if}
  </div>
</main>

<!-- User info modal -->
<dialog bind:this={dialog} class="max-w-lg rounded-lg backdrop:bg-black/50">
  {#if scannedUser}
    <div class="space-y-6 p-6">
      <h2 class="text-2xl font-bold">{$LL.admin.verifyQr.userInfo()}</h2>

      <!-- User details -->
      <div class="space-y-3 rounded-lg border p-4">
        <div>
          <div class="text-sm text-muted-foreground">{$LL.user.firstNames()}</div>
          <div class="font-medium">
            {scannedUser.user.firstNames || "-"}
            {scannedUser.user.lastName || ""}
          </div>
        </div>
        <div>
          <div class="text-sm text-muted-foreground">{$LL.user.email()}</div>
          <div class="font-medium">{scannedUser.user.email}</div>
        </div>
        <div>
          <div class="text-sm text-muted-foreground">{$LL.user.homeMunicipality()}</div>
          <div class="font-medium">{scannedUser.user.homeMunicipality || "-"}</div>
        </div>
      </div>

      <!-- Memberships -->
      <div class="space-y-3">
        <h3 class="font-semibold">{$LL.admin.verifyQr.memberships()}</h3>
        {#if scannedUser.memberships.length > 0}
          <div class="space-y-2">
            {#each scannedUser.memberships as membership (membership.id)}
              <div class="rounded-lg border p-3">
                <div class="flex items-start justify-between">
                  <div>
                    <div class="font-medium">{membership.membershipType.name.fi}</div>
                    <div class="text-sm text-muted-foreground">
                      {formatDate(membership.membership.startTime)} - {formatDate(membership.membership.endTime)}
                    </div>
                  </div>
                  <Badge variant={getStatusBadge(membership.status)}>
                    {membership.status === "active" ? $LL.membership.status.active() : $LL.membership.status.expired()}
                  </Badge>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">{$LL.admin.verifyQr.noMemberships()}</p>
        {/if}
      </div>

      <!-- Close button -->
      <Button onclick={closeModal} class="w-full">{$LL.common.cancel()}</Button>
    </div>
  {/if}
</dialog>
