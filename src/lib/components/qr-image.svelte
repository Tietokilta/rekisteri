<script lang="ts">
  import QRCode from "qrcode";
  import { LL } from "$lib/i18n/i18n-svelte";

  type Props = {
    token: string;
  };

  let { token }: Props = $props();

  const qrDataUrl = $derived(
    await QRCode.toDataURL(token, {
      width: 280,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    }),
  );
</script>

<div class="rounded-lg bg-white p-4 shadow-lg">
  <img src={qrDataUrl} alt={$LL.memberCard.qrAlt()} class="h-auto w-70" />
</div>
