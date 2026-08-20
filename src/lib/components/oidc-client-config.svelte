<script lang="ts">
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { Badge } from "$lib/components/ui/badge";
  import Lock from "@lucide/svelte/icons/lock";
  import ScopeIcon from "$lib/components/oidc-icon.svelte";
  import { OPENID_CLAIMS, ALL_CLAIMS, OIDC_SCOPES, OPTIONAL_CLAIMS } from "$lib/shared/oidc";

  let {
    scopes = $bindable([]),
    namePrefix = "scope_claim",
  }: {
    scopes: string[];
    namePrefix?: string;
  } = $props();

  const oidcAdmin = $derived($LL.admin.settings.oidc);
  const currentLang = $derived($locale === "fi" ? "fi" : "en");

  function toggleScope(scopes: string[], scopeKey: string, enabled?: boolean): string[] {
    const list = Array.isArray(scopes) ? [...scopes] : [];
    const isPresent = list.includes(scopeKey);
    const shouldEnable = enabled === undefined ? !isPresent : enabled;

    if (shouldEnable && !isPresent) {
      list.push(scopeKey);
    } else if (!shouldEnable && isPresent) {
      return list.filter((item) => item !== scopeKey);
    }
    return list;
  }

  function isScopeEnabled(scopes: string[], scopeKey: string): boolean {
    if (!Array.isArray(scopes)) return false;
    if (scopes.includes(scopeKey)) return true;
    const def = ALL_CLAIMS.find((d) => d.key === scopeKey);
    return Boolean(def && scopes.includes(def.scope));
  }
</script>

<div class="space-y-4">
  <p class="mb-1 text-xs font-medium text-foreground">
    {oidcAdmin.claims()}
  </p>

  <div class="space-y-4">
    <!-- Mandatory Protocol Claims Banner -->
    <div
      class="space-y-2.5 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3.5 text-xs text-orange-950 dark:text-orange-200"
    >
      <input type="hidden" name="idTokenClaims[]" value="openid" />
      <div class="flex items-center justify-between gap-2 font-semibold text-orange-900 dark:text-orange-300">
        <div class="flex items-center gap-1.5">
          <ScopeIcon scopeId="openid" class="size-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
          <span>{oidcAdmin.form.openidClaims()}</span>
        </div>
        <Badge variant="secondary" class="gap-1 bg-orange-500/15 text-[10px] text-orange-700 dark:text-orange-300">
          <Lock class="size-3" />
          <span>{$LL.common.required()}</span>
        </Badge>
      </div>
      <div class="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
        {#each OPENID_CLAIMS as claim (claim.key)}
          <div
            class="flex items-center justify-between gap-2 rounded-md border border-orange-500/20 bg-background/60 p-2 text-[11px]"
          >
            <span class="truncate font-medium text-foreground">{claim.title[currentLang]}</span>
            <Badge
              variant="secondary"
              class="shrink-0 bg-orange-500/15 px-1.5 py-0.5 font-mono text-[11px] text-orange-700 dark:text-orange-300"
            >
              {claim.key}
            </Badge>
          </div>
        {/each}
      </div>
    </div>

    <!-- Scopes -->
    <div class="space-y-4">
      {#each OIDC_SCOPES.filter((c) => c.key != "openid") as scope ((scope.key, scope.title, scope.claims))}
        {@const scopeTitle = scope.title}
        {@const scopeClaims = OPTIONAL_CLAIMS.filter((c) => c.scope === scope.key)}
        {@const enabled = isScopeEnabled(scopes, scope.key)}

        <label
          class="flex cursor-pointer flex-col gap-2 rounded-lg border p-2.5 transition-colors hover:bg-accent/40 {enabled
            ? 'border-primary/40 bg-primary/5'
            : 'border-border/60 bg-background'}"
        >
          <div
            class="flex justify-between border-b pb-2 {enabled
              ? 'border-primary/30'
              : 'border-border/60 bg-background'}"
          >
            <div class="flex items-center gap-2">
              <ScopeIcon scopeId={scope.key} class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="text-xs font-medium text-foreground">{scopeTitle[currentLang]}</span>
            </div>

            <input
              type="checkbox"
              name={`${namePrefix}_${scope.key}`}
              checked={enabled}
              onchange={(e) => (scopes = toggleScope(scopes, scope.key, e.currentTarget.checked))}
              class="size-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary"
            />
          </div>

          <div class="flex flex-wrap gap-2">
            {#each scopeClaims as claim (claim.key)}
              <Badge
                variant="secondary"
                class="shrink-0 bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary"
              >
                {claim.key}
              </Badge>
            {/each}
          </div>
        </label>
      {/each}
    </div>

    <!-- Hidden inputs for active claims form submit -->
    {#each scopes as s (s)}
      <input type="hidden" name="idTokenClaims[]" value={s} />
    {/each}
  </div>
</div>
