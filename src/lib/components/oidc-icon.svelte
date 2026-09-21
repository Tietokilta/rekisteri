<script lang="ts">
  import FingerprintPattern from "@lucide/svelte/icons/fingerprint-pattern";
  import CloudSync from "@lucide/svelte/icons/cloud-sync";
  import User from "@lucide/svelte/icons/user";
  import Mail from "@lucide/svelte/icons/mail";
  import IdCard from "@lucide/svelte/icons/id-card";
  import Key from "@lucide/svelte/icons/key";
  import { OIDC_SCOPES } from "$lib/shared/oidc";

  let { scopeId, class: className = "size-3.5" }: { scopeId: string; class?: string } = $props();

  const lucideIconMap: Record<string, typeof FingerprintPattern> = {
    FingerprintPattern,
    CloudSync,
    User,
    Mail,
    IdCard,
  };

  const resolvedIconName = $derived.by(() => {
    if (!scopeId) return;
    // Direct match in Lucide icon map (e.g. "User", "Mail", "IdCard", "CloudSync", "FingerprintPattern")
    if (lucideIconMap[scopeId]) {
      return scopeId;
    }
    // Match by scope key in OIDC_SCOPES (e.g. "profile", "email", "membership", "offline_access", "openid")
    const scopeObj = OIDC_SCOPES.find((s) => s.key === scopeId);
    return scopeObj?.icon;
  });

  const IconComponent = $derived((resolvedIconName && lucideIconMap[resolvedIconName]) || Key);
</script>

<IconComponent class={className} />
