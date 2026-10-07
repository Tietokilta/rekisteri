<script lang="ts">
  import { onDestroy } from "svelte";
  import QrScanner from "qr-scanner";
  import QrCode from "@lucide/svelte/icons/qr-code";
  import X from "@lucide/svelte/icons/x";
  import { LL } from "$lib/i18n/i18n-svelte";
  import { Button } from "$lib/components/ui/button";
  import { remoteErrorMessage } from "./types";

  type ScanResult = { displayName: string; membershipTypeId: string | null };

  let {
    onScan,
    typeName,
  }: {
    onScan: (token: string, direction: "in" | "out") => Promise<ScanResult>;
    typeName: (id: string | null) => string;
  } = $props();

  let scanning = $state(false);
  let processing = $state(false);
  let direction = $state<"in" | "out">("in");
  let videoEl = $state<HTMLVideoElement | null>(null);
  /** `mismatch`: the person is already in (or out), so the other direction was probably meant. */
  let feedback = $state<{ kind: "success" | "error" | "mismatch"; text: string } | null>(null);
  let scanner: QrScanner | null = null;
  let lastToken = "";
  let clearTokenTimer: ReturnType<typeof setTimeout> | undefined;

  function close() {
    scanning = false;
    clearTimeout(clearTokenTimer);
    lastToken = "";
  }

  function decoded(token: string) {
    clearTimeout(clearTokenTimer);
    clearTokenTimer = setTimeout(() => (lastToken = ""), 1500);
    if (processing || token === lastToken) return;
    lastToken = token;
    processing = true;
    feedback = null;
    const action = direction;
    void onScan(token, action)
      .then((result) => {
        feedback = {
          kind: "success",
          text: `${action === "in" ? $LL.admin.meetings.scanIn() : $LL.admin.meetings.scanOut()}: ${result.displayName} · ${typeName(result.membershipTypeId)}`,
        };
      })
      .catch((cause) => {
        const text = remoteErrorMessage(cause, $LL.admin.meetings.scanFailed());
        // Suggest the other direction, but leave switching to the operator
        if (text === $LL.admin.meetings.scanAlreadyIn()) {
          feedback = { kind: "mismatch", text: `${text}. ${$LL.admin.meetings.suggestScanOut()}` };
        } else if (text === $LL.admin.meetings.scanAlreadyOut()) {
          feedback = { kind: "mismatch", text: `${text}. ${$LL.admin.meetings.suggestScanIn()}` };
        } else {
          feedback = { kind: "error", text };
        }
      })
      .finally(() => {
        processing = false;
      });
  }

  $effect(() => {
    if (!scanning || !videoEl) return;
    const instance = new QrScanner(videoEl, (result) => decoded(result.data), {
      preferredCamera: "environment",
      highlightScanRegion: true,
    });
    scanner = instance;
    void instance.start().catch(() => {
      if (scanner === instance) feedback = { kind: "error", text: $LL.admin.verifyQr.cameraError() };
    });
    return () => {
      instance.destroy();
      if (scanner === instance) scanner = null;
    };
  });

  onDestroy(() => {
    clearTimeout(clearTokenTimer);
    scanner?.destroy();
  });
</script>

<Button
  variant="outline"
  onclick={() => {
    direction = "in";
    feedback = null;
    scanning = true;
  }}
>
  <QrCode class="mr-2 size-4" />
  {$LL.admin.meetings.scanQr()}
</Button>

{#if scanning}
  <div
    class="fixed inset-0 z-60 flex flex-col bg-background"
    role="dialog"
    aria-modal="true"
    aria-label={$LL.admin.meetings.scanQr()}
  >
    <div class="flex items-center justify-between border-b p-4">
      <h2 class="text-lg font-semibold" data-testid="scan-mode">
        {direction === "in" ? $LL.admin.meetings.scanningIn() : $LL.admin.meetings.scanningOut()}
      </h2>
      <Button variant="ghost" size="icon" onclick={close} aria-label={$LL.admin.verifyQr.closeScanner()}><X /></Button>
    </div>
    <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <div class="relative min-h-48 flex-1 overflow-hidden rounded-lg bg-black">
        <video bind:this={videoEl} class="absolute inset-0 h-full w-full object-cover" playsinline></video>
        <span
          class={[
            "absolute top-3 left-3 rounded-full px-3 py-1 text-sm font-semibold",
            direction === "in" ? "bg-primary text-primary-foreground" : "bg-amber-500 text-black",
          ]}
          aria-hidden="true"
        >
          {direction === "in" ? $LL.admin.meetings.scanIn() : $LL.admin.meetings.scanOut()}
        </span>
      </div>
      <div class="min-h-16" aria-live="polite">
        {#if processing}
          <p class="text-center">{$LL.admin.meetings.scanRecording()}</p>
        {:else if feedback}
          <p
            class={feedback.kind === "success"
              ? "rounded-md border border-green-500/50 bg-green-500/10 p-3 text-center font-semibold"
              : "rounded-md border border-destructive bg-destructive/10 p-3 text-center font-semibold text-destructive"}
          >
            {feedback.text}
          </p>
        {:else}
          <p class="text-center text-muted-foreground">{$LL.admin.verifyQr.scanInstructions()}</p>
        {/if}
      </div>
      <!-- At the bottom, within thumb reach on a phone -->
      <Button
        size="lg"
        class="h-14 w-full text-base"
        variant={feedback?.kind === "mismatch" ? "default" : "outline"}
        disabled={processing}
        onclick={() => {
          direction = direction === "in" ? "out" : "in";
          feedback = null;
        }}
      >
        {direction === "in" ? $LL.admin.meetings.switchToScanOut() : $LL.admin.meetings.switchToScanIn()}
      </Button>
    </div>
  </div>
{/if}
