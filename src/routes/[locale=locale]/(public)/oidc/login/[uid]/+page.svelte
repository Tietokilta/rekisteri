<script lang="ts">
  import type { PageData } from "./$types";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import ShieldKeyhole from "@lucide/svelte/icons/shield-keyhole";
  import Eye from "@lucide/svelte/icons/eye";
  import ScopeIcon from "$lib/components/oidc-icon.svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { signIn } from "../../../sign-in/data.remote";
  import { signInSchema } from "../../../sign-in/schema";

  import { OIDC_SCOPES } from "$lib/shared/oidc";

  let { data }: { data: PageData } = $props();
  const textLocale = $derived($locale === "fi" ? "fi" : "en");
</script>

<svelte:head>
  <title>{$LL.app.title()} - {$LL.oidc.consent.title()}</title>
</svelte:head>

<div class="my-auto flex w-full items-center justify-center p-4 py-8">
  <div class="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-md sm:p-8">
    <!-- Header -->
    <div class="flex shrink-0 flex-col items-center text-center">
      <div class="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-primary">
        <ShieldKeyhole class="size-6 text-emerald-500" />
      </div>
      <h1 class="mt-2 text-lg font-bold tracking-tight text-foreground sm:text-xl">
        {data.client.name}
      </h1>
      <p class="mt-2 text-xs text-muted-foreground">
        {$LL.oidc.consent.introduction()}
      </p>
    </div>

    <!-- User Info Card or Sign-in form -->
    {#if data.user}
      <div
        class="mt-4 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/40 p-3"
      >
        <div class="min-w-0 flex-1 text-xs">
          <p class="font-medium text-foreground">
            {[data.user.firstNames, data.user.lastName].filter(Boolean).join(" ") || data.user.email}
          </p>
          <p class="truncate text-muted-foreground">{data.user.email}</p>
        </div>

        <form method="POST" action="?/switchAccount">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {$LL.auth.changeEmail()}
          </Button>
        </form>
      </div>
    {:else}
      <div class="mt-4 space-y-3 rounded-xl border border-border/80 bg-muted/30 p-4">
        <div class="text-center">
          <h2 class="text-base font-semibold text-foreground">{$LL.auth.signInOrCreateAccount()}</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">{$LL.auth.signInDescription()}</p>
        </div>

        <form {...signIn.preflight(signInSchema)} class="flex flex-col gap-3">
          <div>
            <Label for="email" class="mb-1 block text-xs font-medium text-foreground">{$LL.auth.email()}</Label>
            <Input
              {...signIn.fields.email.as("email")}
              id="email"
              autocomplete="email"
              autocapitalize="none"
              autocorrect="off"
              placeholder="member@kilta.fi"
              required
              class="w-full"
            />
          </div>
          <Button type="submit" disabled={!!signIn.pending} class="w-full">
            {$LL.auth.continue()}
          </Button>
        </form>

        {#each signIn.fields.allIssues() as issue, i (i)}
          <p class="text-center text-xs text-red-600">{issue.message}</p>
        {/each}
      </div>
    {/if}

    {#if data.user}
      <form method="POST" action="?/accept" class="mt-4 flex min-h-0 flex-1 flex-col justify-between space-y-4">
        <!-- Requested access display -->
        <div class="flex min-h-0 flex-1 flex-col space-y-2">
          <div class="flex shrink-0 items-center justify-between">
            <h2 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {$LL.oidc.consent.requestedPermissions()}
            </h2>
            <Badge variant="outline" class="gap-1 border-primary/30 bg-primary/10 font-mono text-[10px] text-primary">
              <Eye class="size-3" />
              <span>{$LL.oidc.consent.readOnly()}</span>
            </Badge>
          </div>

          <div class="space-y-2">
            {#each OIDC_SCOPES.filter((item) => data.client.scopes.includes(item.key)) as item (item.key)}
              <div class="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div class="mt-0.5 shrink-0">
                  {#if item.key === "openid"}
                    <ScopeIcon scopeId={item.key} class="size-4 text-orange-600 dark:text-orange-400" />
                  {:else}
                    <ScopeIcon scopeId={item.key} class="size-4 text-primary" />
                  {/if}
                </div>
                <div class="min-w-0 flex-1 space-y-0.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-foreground">
                      {item.title[textLocale]}
                    </span>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <p class="shrink-0 text-center text-[11px] text-muted-foreground">
            {$LL.oidc.consent.proceedNotice()}
          </p>
        </div>

        <!-- Action Buttons (Accept All / Deny All) -->
        <div class="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="submit" form="deny-form" variant="outline" class="w-full sm:w-auto">
            {$LL.oidc.consent.deny()}
          </Button>
          <Button type="submit" class="w-full sm:w-auto">
            {$LL.oidc.consent.allowAccess()}
          </Button>
        </div>
      </form>

      <form id="deny-form" method="POST" action="?/deny" class="hidden"></form>
    {/if}
  </div>
</div>
