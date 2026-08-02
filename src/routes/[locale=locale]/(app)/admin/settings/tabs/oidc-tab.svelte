<script lang="ts">
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { invalidateAll } from "$app/navigation";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { toast } from "svelte-sonner";
  import type { PageData } from "../$types";

  import { createOidcClient, updateOidcClient, deleteOidcClient, regenerateOidcClientSecret } from "../data.remote";
  import {
    createOidcClientSchema,
    updateOidcClientSchema,
    deleteOidcClientSchema,
    regenerateOidcClientSecretSchema,
  } from "../schema";

  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Edit3 from "@lucide/svelte/icons/edit-3";
  import Copy from "@lucide/svelte/icons/copy";
  import Key from "@lucide/svelte/icons/key";
  import Info from "@lucide/svelte/icons/info";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import RotateCcwKey from "@lucide/svelte/icons/rotate-ccw-key";
  import IdCardLanyard from "@lucide/svelte/icons/id-card-lanyard";
  import Binary from "@lucide/svelte/icons/binary";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import CloudSync from "@lucide/svelte/icons/cloud-sync";
  import { browser } from "$app/environment";
  import OidcClientConfig from "$lib/components/oidc-client-config.svelte";
  import { OPENID_CLAIM_KEYS } from "$lib/shared/oidc";
  import { getClaimsForScopes } from "$lib/utils";

  let {
    data,
    newCreatedSecret = $bindable(),
    showCreateOidcModal = $bindable(),
    editingOidcClient = $bindable(),
    copyToClipboard,
  }: {
    data: PageData;
    newCreatedSecret: string | null;
    showCreateOidcModal: boolean;
    editingOidcClient: {
      id: string;
      name: string;
      allowedOrigins?: string;
      redirectUris: string;
      scopes: string[];
      grantTypes: string[];
      clientSecret?: string | null;
    } | null;
    copyToClipboard: (text: string) => void;
    getGrantTypeBadgeClass: (id: string) => string;
  } = $props();

  const oidcAdmin = $derived($LL.admin.settings.oidc);
  const sortedOidcClients = $derived(
    data.oidcClients.toSorted((a, b) => a.name.localeCompare(b.name, $locale, { sensitivity: "base" })),
  );

  let createAllowedScopes = $state<string[]>(["profile", "email", "membership"]);
  let showInfoModal = $state(false);
  let deletingClient = $state<{ id: string; name: string } | null>(null);
  let regeneratingClient = $state<{ id: string; name: string } | null>(null);
  let regeneratedSecret = $state<string | null>(null);
</script>

<Tabs.Content value="oidcClients" class="mt-4 space-y-4">
  <div class="rounded-xl border border-border/60 bg-card p-5 shadow-xs">
    <div class="mb-4 flex flex-wrap items-center justify-between">
      <div>
        <h3 class="text-base font-semibold text-foreground">{oidcAdmin.title()}</h3>
        <p class="text-xs text-muted-foreground">{oidcAdmin.description()}</p>
      </div>
      <div class="flex items-center gap-4">
        <Button type="button" variant="outline" onclick={() => (showInfoModal = true)} class="font-medium">
          <span>{oidcAdmin.endpoints.button()}</span>
        </Button>

        <Button
          type="button"
          disabled={!data.canWrite}
          onclick={() => {
            showCreateOidcModal = true;
          }}
        >
          <span>{oidcAdmin.newClient()}</span>
        </Button>
      </div>
    </div>

    <!-- Create New Application Form / Popup Modal -->
    <AlertDialog.Root open={showCreateOidcModal} onOpenChange={(open) => (showCreateOidcModal = open)}>
      <AlertDialog.Content class="max-h-[85vh] overflow-y-auto p-6 sm:max-w-2xl">
        <form
          {...createOidcClient.preflight(createOidcClientSchema).enhance(async ({ submit }) => {
            await submit();
            if (createOidcClient.result?.success) {
              if (createOidcClient.result.clientSecret) {
                newCreatedSecret = createOidcClient.result.clientSecret;
              }
              showCreateOidcModal = false;
              await invalidateAll();
              toast.success(oidcAdmin.toast.createSuccess());
            }
          })}
          class="space-y-4"
        >
          <input type="hidden" name="grantTypes[]" value="authorization_code" />

          <div class="flex items-center justify-between border-b border-border/60 pb-3">
            <AlertDialog.Title class="text-base font-semibold text-foreground">
              {oidcAdmin.form.createTitle()}
            </AlertDialog.Title>
            <div class="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onclick={() => (showCreateOidcModal = false)}>
                {$LL.common.cancel()}
              </Button>
              <Button type="submit" size="sm" disabled={!!createOidcClient.pending}>
                {$LL.common.create()}
              </Button>
            </div>
          </div>

          <div>
            <label for="create-app-name" class="block text-xs font-medium text-foreground">
              {oidcAdmin.form.applicationName()}
            </label>
            <Input
              type="text"
              id="create-app-name"
              name="name"
              placeholder={oidcAdmin.form.applicationNamePlaceholder()}
              class="mt-1"
              required
            />
            {#if createOidcClient.fields.name.issues()?.length}
              <p class="mt-1 text-xs text-destructive">{createOidcClient.fields.name.issues()?.[0]?.message}</p>
            {/if}
          </div>

          <div>
            <label for="edit-allowed-origins" class="text-xs font-medium text-foreground">
              {oidcAdmin.allowedOrigins()}
              {$LL.common.onePerLine()}
            </label>
            <textarea
              id="edit-allowed-origins"
              name="allowedOrigins"
              rows={2}
              placeholder={oidcAdmin.form.allowedOriginsPlaceholder()}
              class="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              required></textarea>
            {#if createOidcClient.fields.allowedOrigins.issues()?.length}
              <p class="mt-1 text-xs text-destructive">
                {createOidcClient.fields.allowedOrigins.issues()?.[0]?.message}
              </p>
            {/if}
          </div>

          <div>
            <label for="create-redirect-uris" class="block text-xs font-medium text-foreground">
              {oidcAdmin.redirectUris()}
              {$LL.common.onePerLine()}
            </label>
            <textarea
              id="create-redirect-uris"
              name="redirectUris"
              rows={3}
              placeholder={oidcAdmin.form.redirectUrisPlaceholder()}
              class="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              required></textarea>
            {#if createOidcClient.fields.redirectUris.issues()?.length}
              <p class="mt-1 text-xs text-destructive">
                {createOidcClient.fields.redirectUris.issues()?.[0]?.message}
              </p>
            {/if}
          </div>

          <!-- Configurable Scopes Section -->
          <OidcClientConfig bind:scopes={createAllowedScopes} namePrefix="scope_category_create" />
        </form>
      </AlertDialog.Content>
    </AlertDialog.Root>

    <!-- Edit Application Form / Popup Modal -->
    <AlertDialog.Root
      open={!!editingOidcClient}
      onOpenChange={(open) => {
        if (!open) editingOidcClient = null;
      }}
    >
      {#if editingOidcClient}
        <AlertDialog.Content class="max-h-[85vh] overflow-y-auto p-6 sm:max-w-2xl">
          <form
            {...updateOidcClient.preflight(updateOidcClientSchema).enhance(async ({ submit }) => {
              await submit();
              if (updateOidcClient.result?.success) {
                editingOidcClient = null;
                await invalidateAll();
                toast.success(oidcAdmin.toast.updateSuccess());
              }
            })}
            class="space-y-4"
          >
            <input type="hidden" name="id" value={editingOidcClient.id} />
            <input type="hidden" name="grantTypes[]" value="authorization_code" />

            <div class="flex items-center justify-between border-b border-border/60 pb-3">
              <AlertDialog.Title class="text-base font-semibold text-foreground">
                {oidcAdmin.form.editTitle({ name: editingOidcClient.name })}
              </AlertDialog.Title>
              <div class="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onclick={() => (editingOidcClient = null)}>
                  {$LL.common.cancel()}
                </Button>
                <Button type="submit" size="sm" disabled={!!updateOidcClient.pending}>
                  {$LL.common.save()}
                </Button>
              </div>
            </div>

            <div>
              <label for="edit-name" class="text-xs font-medium text-foreground"
                >{oidcAdmin.form.applicationName()}</label
              >
              <Input id="edit-name" name="name" type="text" bind:value={editingOidcClient.name} required class="mt-1" />
            </div>

            <div>
              <label for="edit-allowed-origins" class="text-xs font-medium text-foreground">
                {oidcAdmin.allowedOrigins()}
                {$LL.common.onePerLine()}
              </label>
              <textarea
                id="edit-allowed-origins"
                name="allowedOrigins"
                rows={2}
                bind:value={editingOidcClient.allowedOrigins}
                placeholder={oidcAdmin.form.allowedOriginsPlaceholder()}
                class="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              ></textarea>
            </div>

            <div>
              <label for="edit-redirect-uris" class="text-xs font-medium text-foreground">
                {oidcAdmin.redirectUris()}
                {$LL.common.onePerLine()}
              </label>
              <textarea
                id="edit-redirect-uris"
                name="redirectUris"
                rows={3}
                bind:value={editingOidcClient.redirectUris}
                class="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              ></textarea>
            </div>

            <!-- Configurable Scopes Section -->
            <OidcClientConfig bind:scopes={editingOidcClient.scopes} namePrefix="scope_category_edit" />
          </form>
        </AlertDialog.Content>
      {/if}
    </AlertDialog.Root>

    <!-- Registered Clients List -->
    <div class="space-y-3">
      {#each sortedOidcClients as client (client.clientId)}
        <div
          class="rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80"
          data-testid={`oidc-client-row-${client.clientId}`}
        >
          <div class="flex flex-col">
            <div class="flex items-start justify-between">
              <div class="flex gap-3">
                <h4 class="font-semibold text-foreground">{client.name}</h4>
                <div class="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    class="gap-1 border-blue-500/30 bg-blue-500/10 font-mono text-[10px] text-blue-700 dark:text-blue-300"
                  >
                    <Binary class="size-3" />
                    <span>{client.type}</span>
                  </Badge>

                  <ArrowRight class="size-3 shrink-0 text-muted-foreground/70" />

                  <Badge
                    variant="outline"
                    class="gap-1 border-primary/30 bg-primary/10 font-mono text-[10px] text-primary"
                  >
                    <IdCardLanyard class="size-3" />
                    <span>id_token</span>
                  </Badge>

                  {#if client.scopes?.includes("offline_access")}
                    <Badge
                      variant="outline"
                      class="gap-1 border-primary/30 bg-primary/10 font-mono text-[10px] text-primary"
                    >
                      <CloudSync class="size-3" />
                      <span>refresh_token</span>
                    </Badge>
                  {/if}
                </div>
              </div>

              <div class="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={oidcAdmin.secret.regenerate()}
                  onclick={() => {
                    regeneratedSecret = null;
                    regeneratingClient = { id: client.clientId, name: client.name };
                  }}
                  disabled={!data.canWrite}
                  class="h-8"
                >
                  <RotateCcwKey class="size-3.5" />
                  <span class="sr-only">{oidcAdmin.secret.regenerate()}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onclick={() =>
                    (editingOidcClient = {
                      id: client.clientId,
                      name: client.name,
                      allowedOrigins: (client.allowedOrigins || []).join("\n"),
                      redirectUris: client.redirectUris.join("\n"),
                      scopes: [...client.scopes],
                      grantTypes: [
                        client.type,
                        ...(client.scopes?.includes("offline_access") ? ["refresh_token"] : []),
                      ],
                    })}
                  disabled={!data.canWrite}
                  class="h-8"
                  title={$LL.common.edit()}
                >
                  <Edit3 class="size-3.5" />
                  <span class="sr-only">{$LL.common.edit()}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onclick={() => (deletingClient = { id: client.clientId, name: client.name })}
                  disabled={!data.canWrite}
                  class="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  title={$LL.common.delete()}
                >
                  <Trash2 class="size-3.5" />
                  <span class="sr-only">{$LL.common.delete()}</span>
                </Button>
              </div>
            </div>

            <div class="space-y-2">
              <div>
                <p class="text-[11px] font-medium text-muted-foreground">{oidcAdmin.clientId()}</p>
                <div class="flex flex-wrap items-center text-xs text-muted-foreground">
                  <div
                    class="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1 font-mono text-xs"
                  >
                    <span class="text-foreground">{client.clientId}</span>
                    <button
                      type="button"
                      onclick={() => copyToClipboard(client.clientId)}
                      class="hover:text-foreground"
                    >
                      <Copy class="size-3" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span>{oidcAdmin.claims()}</span>
                </div>
                <div class="mt-1.5 flex flex-wrap gap-1">
                  {#each getClaimsForScopes(client.scopes) as claimKey (claimKey)}
                    {#if OPENID_CLAIM_KEYS.has(claimKey)}
                      <Badge
                        variant="secondary"
                        class="bg-orange-500/15 px-1.5 py-0.5 font-mono text-[10px] text-orange-700 dark:text-orange-300"
                      >
                        {claimKey}
                      </Badge>
                    {:else}
                      <Badge variant="secondary" class="bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                        {claimKey}
                      </Badge>
                    {/if}
                  {/each}
                </div>
              </div>

              {#if client.allowedOrigins && client.allowedOrigins.length > 0}
                <div>
                  <p class="text-[11px] font-medium text-muted-foreground">{oidcAdmin.allowedOrigins()}:</p>
                  <div class="mt-1 flex flex-wrap gap-1.5">
                    {#each client.allowedOrigins as addr, idx (`addr-${addr}-${idx}`)}
                      <div
                        class="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1 font-mono text-xs"
                      >
                        <span class="break-all text-foreground">{addr}</span>
                        <button
                          type="button"
                          onclick={() => copyToClipboard(addr)}
                          title={$LL.common.copyUri()}
                          class="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Copy class="size-3" />
                        </button>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if client.type === "authorization_code" && client.redirectUris.length > 0}
                <div>
                  <p class="text-[11px] font-medium text-muted-foreground">{oidcAdmin.redirectUris()}:</p>
                  <div class="mt-1 flex flex-wrap gap-1.5">
                    {#each client.redirectUris as uri, idx (`uri-${uri}-${idx}`)}
                      <div
                        class="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1 font-mono text-xs"
                      >
                        <span class="break-all text-foreground">{uri}</span>
                        <button
                          type="button"
                          onclick={() => copyToClipboard(uri)}
                          title={$LL.common.copyUri()}
                          class="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Copy class="size-3" />
                        </button>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</Tabs.Content>

<!-- Regenerate Secret Confirmation & Display Modal -->
<AlertDialog.Root
  open={!!regeneratingClient}
  onOpenChange={(open) => {
    if (open) return;
    regeneratingClient = null;
    regeneratedSecret = null;
  }}
>
  {#if regeneratingClient}
    <AlertDialog.Content class="sm:max-w-md">
      {#if !regeneratedSecret}
        <!-- Confirmation Step -->
        <AlertDialog.Header>
          <AlertDialog.Title class="flex items-center gap-2">
            <RotateCcwKey class="size-5 text-amber-500" />
            <span>{oidcAdmin.secret.regenerateTitle()}</span>
          </AlertDialog.Title>
          <AlertDialog.Description class="text-xs leading-relaxed">
            <p class="mb-2 text-sm font-medium text-amber-500">{regeneratingClient.name}</p>
            <p>{oidcAdmin.secret.regenerateWarning()}</p>
          </AlertDialog.Description>
        </AlertDialog.Header>

        <form
          {...regenerateOidcClientSecret
            .for(regeneratingClient.id)
            .preflight(regenerateOidcClientSecretSchema)
            .enhance(async ({ submit }) => {
              const targetClientId = regeneratingClient?.id;
              if (!targetClientId) return;
              await submit();
              const res = regenerateOidcClientSecret.for(targetClientId).result;
              if (res?.success && res.clientSecret) {
                regeneratedSecret = res.clientSecret;
                await invalidateAll();
                toast.success(oidcAdmin.toast.newSecret());
              }
            })}
        >
          <input type="hidden" name="id" value={regeneratingClient.id} />
          <AlertDialog.Footer class="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={() => {
                regeneratingClient = null;
                regeneratedSecret = null;
              }}
            >
              {$LL.common.cancel()}
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={!!regenerateOidcClientSecret.for(regeneratingClient.id).pending}
              class="bg-amber-500 hover:bg-amber-500/90"
            >
              <RotateCcwKey class="mr-1 size-3.5" />
              <span>{oidcAdmin.secret.regenerate()}</span>
            </Button>
          </AlertDialog.Footer>
        </form>
      {:else}
        <!-- New Secret Display Step -->
        <AlertDialog.Header>
          <AlertDialog.Title class="flex items-center gap-2 text-green-700 dark:text-green-400">
            <Key class="size-5" />
            <span>{oidcAdmin.secret.newTitle()}</span>
          </AlertDialog.Title>
          <AlertDialog.Description class="pt-2 text-xs leading-relaxed">
            {oidcAdmin.secret.newDescription()}
          </AlertDialog.Description>
        </AlertDialog.Header>

        <div class="flex items-center gap-2">
          <code
            class="flex-1 rounded border border-border bg-background px-3 py-1.5 font-mono text-xs font-semibold break-all text-foreground select-all"
          >
            {regeneratedSecret}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onclick={() => regeneratedSecret && copyToClipboard(regeneratedSecret)}
            class="h-8 shrink-0 gap-1.5 px-2.5"
          >
            <Copy class="size-3.5" />
          </Button>
        </div>

        <AlertDialog.Footer class="flex justify-end">
          <Button
            type="button"
            size="sm"
            onclick={() => {
              regeneratingClient = null;
              regeneratedSecret = null;
            }}
          >
            {$LL.common.done()}
          </Button>
        </AlertDialog.Footer>
      {/if}
    </AlertDialog.Content>
  {/if}
</AlertDialog.Root>

<!-- New Client Secret Display Modal -->
<AlertDialog.Root
  open={!!newCreatedSecret}
  onOpenChange={(open) => {
    if (!open) newCreatedSecret = null;
  }}
>
  {#if newCreatedSecret}
    <AlertDialog.Content class="sm:max-w-md">
      <AlertDialog.Header>
        <AlertDialog.Title class="flex items-center gap-2 text-green-700 dark:text-green-400">
          <Key class="size-5" />
          <span>{oidcAdmin.secret.newTitle()}</span>
        </AlertDialog.Title>
        <AlertDialog.Description class="pt-2 text-xs leading-relaxed">
          {oidcAdmin.secret.newDescription()}
        </AlertDialog.Description>
      </AlertDialog.Header>

      <div class="flex items-center gap-2">
        <code
          class="flex-1 rounded border border-border bg-background px-3 py-1.5 font-mono text-xs font-semibold break-all text-foreground select-all"
        >
          {newCreatedSecret}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onclick={() => newCreatedSecret && copyToClipboard(newCreatedSecret)}
          class="h-8 shrink-0 gap-1.5 px-2.5"
        >
          <Copy class="size-3.5" />
        </Button>
      </div>

      <AlertDialog.Footer class="flex justify-end">
        <Button
          type="button"
          size="sm"
          onclick={() => {
            newCreatedSecret = null;
          }}
        >
          {$LL.common.done()}
        </Button>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  {/if}
</AlertDialog.Root>

<!-- Delete Client Confirmation Modal -->
<AlertDialog.Root
  open={!!deletingClient}
  onOpenChange={(open) => {
    if (!open) deletingClient = null;
  }}
>
  {#if deletingClient}
    <AlertDialog.Content class="sm:max-w-md">
      <AlertDialog.Header>
        <AlertDialog.Title class="flex items-center gap-2">
          <Trash2 class="size-5 text-destructive" />
          <span>{oidcAdmin.delete.title()}</span>
        </AlertDialog.Title>
        <AlertDialog.Description class="flex flex-col text-xs leading-relaxed">
          <p class="mb-2 text-sm font-medium text-destructive">{deletingClient.name}</p>
          <p>{oidcAdmin.delete.description()}</p>
        </AlertDialog.Description>
      </AlertDialog.Header>

      <form
        {...deleteOidcClient
          .for(deletingClient.id)
          .preflight(deleteOidcClientSchema)
          .enhance(async ({ submit }) => {
            await submit();
            deletingClient = null;
            await invalidateAll();
            toast.success(oidcAdmin.toast.deleteSuccess());
          })}
      >
        <input type="hidden" name="id" value={deletingClient.id} />
        <AlertDialog.Footer class="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onclick={() => (deletingClient = null)}>
            {$LL.common.cancel()}
          </Button>
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={!!deleteOidcClient.for(deletingClient.id).pending}
          >
            <Trash2 class="mr-1 size-3.5" />
            <span>{$LL.common.delete()}</span>
          </Button>
        </AlertDialog.Footer>
      </form>
    </AlertDialog.Content>
  {/if}
</AlertDialog.Root>

<!-- Endpoints Modal -->
<AlertDialog.Root open={showInfoModal} onOpenChange={(open) => (showInfoModal = open)}>
  <AlertDialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
    <AlertDialog.Header class="flex flex-row items-center justify-between">
      <div>
        <AlertDialog.Title class="flex items-center gap-2 text-base font-semibold">
          <Info class="size-5 text-primary" />
          <span>{oidcAdmin.endpoints.title()}</span>
        </AlertDialog.Title>
        <AlertDialog.Description class="text-xs">
          {oidcAdmin.endpoints.description()}
        </AlertDialog.Description>
      </div>

      <Button type="button" size="sm" variant="outline" onclick={() => (showInfoModal = false)}>
        {$LL.common.close()}
      </Button>
    </AlertDialog.Header>

    <div class="mt-4 space-y-3 text-xs">
      <div class="grid grid-cols-1 gap-2">
        {#each [{ label: "Discovery Document", url: `${browser ? location.origin : ""}/oidc/.well-known/openid-configuration` }, { label: "Authorization Endpoint", url: `${browser ? location.origin : ""}/oidc/auth` }, { label: "Token Endpoint", url: `${browser ? location.origin : ""}/oidc/token` }, { label: "Public Keys (JWKS)", url: `${browser ? location.origin : ""}/oidc/jwks` }, { label: "Logout Endpoint", url: `${browser ? location.origin : ""}/oidc/logout` }] as ep (ep.label)}
          <div class="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <div class="min-w-0 flex-1">
              <p class="font-medium text-foreground">{ep.label}</p>
              <code class="block truncate font-mono text-[11px] text-muted-foreground select-all">{ep.url}</code>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => browser && window.open(ep.url, "_blank")}
                class="h-7 px-2 text-muted-foreground hover:text-foreground"
                title="Open link"
              >
                <ExternalLink class="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => copyToClipboard(ep.url)}
                class="h-7 px-2 text-muted-foreground hover:text-foreground"
                title="Copy link"
              >
                <Copy class="size-3.5" />
              </Button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </AlertDialog.Content>
</AlertDialog.Root>
