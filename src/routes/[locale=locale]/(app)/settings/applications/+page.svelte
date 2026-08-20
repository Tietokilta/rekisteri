<script lang="ts">
  import type { PageData } from "./$types";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { toast } from "svelte-sonner";
  import AppWindow from "@lucide/svelte/icons/app-window";
  import ShieldOff from "@lucide/svelte/icons/shield-off";
  import Clock from "@lucide/svelte/icons/clock";
  import { revokeGrant } from "./data.remote";
  import { revokeGrantSchema } from "./schema";
  import { formatDate as formatDateUtil } from "$lib/utils";
  import ScopeIcon from "$lib/components/oidc-icon.svelte";
  import { OIDC_SCOPES } from "$lib/shared/oidc";

  let { data }: { data: PageData } = $props();

  function getScopeTitle(scopeKey: string): string {
    const scopeObj = OIDC_SCOPES.find((s) => s.key === scopeKey);
    if (!scopeObj) return scopeKey;
    const currentLocale = ($locale === "en" || $locale === "fi" ? $locale : "fi") as "fi" | "en";
    return scopeObj.title[currentLocale] || scopeObj.title.fi;
  }

  function formatDate(date: Date | string | null): string {
    if (!date) return "";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return formatDateUtil(dateObj, $locale);
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{$LL.settings.applications.title()}</Card.Title>
    <Card.Description>{$LL.settings.applications.description()}</Card.Description>
  </Card.Header>
  <Card.Content class="space-y-3">
    {#if data.grants.length === 0}
      <Empty.Root class="border">
        <Empty.Header>
          <Empty.Media variant="icon">
            <AppWindow />
          </Empty.Media>
        </Empty.Header>
        <Empty.Title>{$LL.settings.applications.title()}</Empty.Title>
        <Empty.Description>{$LL.settings.applications.noGrants()}</Empty.Description>
      </Empty.Root>
    {:else}
      {#each data.grants as grant (grant.id)}
        {@const revokeForm = revokeGrant.for(grant.clientId)}
        <Item.Root variant="outline" size="sm" data-testid={`grant-row-${grant.clientId}`}>
          <Item.Media variant="icon">
            <AppWindow class="text-muted-foreground" />
          </Item.Media>
          <Item.Content>
            <Item.Title class="flex flex-wrap items-center gap-2 font-normal">
              <span class="font-medium text-foreground">{grant.clientName}</span>
              <span class="font-mono text-xs text-muted-foreground">(ID: {grant.clientId})</span>
            </Item.Title>
            <Item.Description class="flex flex-col gap-2 pt-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-xs text-muted-foreground">{$LL.settings.applications.scopes()}:</span>
                {#each grant.grantedScopes as scope (scope)}
                  {#if scope === "openid"}
                    <Badge
                      variant="outline"
                      class="gap-1 border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[11px] text-orange-700 dark:text-orange-300"
                    >
                      <ScopeIcon scopeId={scope} class="size-3.5 shrink-0 opacity-90" />
                      <span>{getScopeTitle(scope)}</span>
                    </Badge>
                  {:else}
                    <Badge variant="outline" class="gap-1 px-1.5 py-0.5 text-[11px]">
                      <ScopeIcon scopeId={scope} class="size-3.5 shrink-0 opacity-80" />
                      <span>{getScopeTitle(scope)}</span>
                    </Badge>
                  {/if}
                {/each}
              </div>
              <span class="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock class="size-3" />
                {$LL.settings.applications.grantedOn()}: {formatDate(grant.createdAt)}
              </span>
            </Item.Description>
          </Item.Content>
          <Item.Actions>
            <form
              class="contents"
              {...revokeForm.preflight(revokeGrantSchema).enhance(async ({ submit }) => {
                await submit();
                await invalidateAll();
                toast.success(revokeGrant.result?.message || $LL.settings.applications.revokedSuccess());
              })}
            >
              <input type="hidden" name="clientId" value={grant.clientId} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                class="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={!!revokeForm.pending}
              >
                <ShieldOff class="size-4" />
                <span>{$LL.settings.applications.revoke()}</span>
              </Button>
            </form>
          </Item.Actions>
        </Item.Root>
      {/each}
    {/if}
  </Card.Content>
</Card.Root>
