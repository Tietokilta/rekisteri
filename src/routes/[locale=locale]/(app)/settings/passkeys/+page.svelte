<script lang="ts">
  import type { PageData } from "./$types";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { startRegistration } from "@simplewebauthn/browser";
  import type { RegistrationResponseJSON } from "@simplewebauthn/server";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Key from "@lucide/svelte/icons/key";
  import Shield from "@lucide/svelte/icons/shield";
  import Clock from "@lucide/svelte/icons/clock";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";

  import { invalidateAll } from "$app/navigation";
  import { LL } from "$lib/i18n/i18n-svelte";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    getRegistrationOptions,
    verifyRegistration,
    deletePasskeyForm,
    renamePasskeyForm,
  } from "$lib/api/passkeys.remote";

  let { data }: { data: PageData } = $props();

  let isRegistering = $state(false);
  let showNameInput = $state(false);
  let deviceNameInput = $state("");
  let pendingCredential = $state<RegistrationResponseJSON | null>(null);
  let errorMessage = $state("");
  let editingPasskeyId = $state<string | null>(null);

  async function startPasskeyRegistration() {
    isRegistering = true;
    errorMessage = "";

    try {
      // Step 1: Get registration options with temporary name
      const { options } = await getRegistrationOptions(getDeviceName());

      // Step 2: Create passkey (WebAuthn ceremony)
      const credential = await startRegistration({ optionsJSON: options });

      // Step 3: Store credential and show name input
      pendingCredential = credential;
      showNameInput = true;
      deviceNameInput = "";
    } catch (error) {
      console.error("Passkey registration error:", error);
      if (error instanceof Error) {
        // Map WebAuthn error types to user-friendly messages
        if (error.name === "NotAllowedError") {
          errorMessage = $LL.auth.passkey.regCancelled();
        } else if (error.name === "InvalidStateError") {
          errorMessage = $LL.auth.passkey.regAlreadyRegistered();
        } else {
          errorMessage = $LL.auth.passkey.regFailed();
        }
      }
    } finally {
      isRegistering = false;
    }
  }

  async function savePasskeyName() {
    if (!pendingCredential) return;

    isRegistering = true;
    errorMessage = "";

    try {
      // Use input or fall back to date-based name
      const deviceName = deviceNameInput.trim() || getDeviceName();

      // Verify and save with chosen name
      await verifyRegistration({ response: pendingCredential, deviceName });

      // Success! Hide name input and reload page data
      showNameInput = false;
      pendingCredential = null;
      await invalidateAll();
    } catch (error) {
      console.error("Passkey verification error:", error);
      errorMessage = $LL.auth.passkey.regFailed();
    } finally {
      isRegistering = false;
    }
  }

  function getDeviceName(): string {
    // Use current date as default name (more reliable than platform detection)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `Passkey ${year}-${month}-${day}`;
  }

  function formatDate(date: Date | string | null): string {
    if (!date) return $LL.auth.passkey.never();
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString();
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{$LL.settings.passkeys.title()}</Card.Title>
    <Card.Description>{$LL.auth.passkey.renameHint()}</Card.Description>
    <Card.Action>
      <Button data-testid="add-passkey-button-header" onclick={startPasskeyRegistration} disabled={isRegistering}>
        {#if isRegistering}
          {$LL.auth.passkey.adding()}
        {:else}
          + {$LL.auth.passkey.addPasskey()}
        {/if}
      </Button>
    </Card.Action>
  </Card.Header>
  <Card.Content class="space-y-4">
    {#if showNameInput}
      <Item.Root variant="outline">
        <Item.Media variant="icon">
          <Key />
        </Item.Media>
        <Item.Content>
          <Item.Title>{$LL.auth.passkey.nameThisPasskey()}</Item.Title>
          <div class="mt-2 space-y-2">
            <Input
              id="new-passkey-name"
              type="text"
              bind:value={deviceNameInput}
              placeholder={getDeviceName()}
              disabled={isRegistering}
              onkeydown={(e) => {
                if (e.key === "Enter") savePasskeyName();
              }}
            />
            <p class="text-sm text-muted-foreground">{$LL.auth.passkey.nameOptional()}</p>
          </div>
        </Item.Content>
        <Item.Actions>
          <Button onclick={savePasskeyName} disabled={isRegistering} size="sm">
            {isRegistering ? $LL.auth.passkey.saving() : $LL.auth.passkey.save()}
          </Button>
        </Item.Actions>
      </Item.Root>
    {/if}

    {#if errorMessage}
      <Alert.Root variant="destructive">
        <Alert.Description>{errorMessage}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if data.passkeys.length === 0}
      <Empty.Root class="border">
        <Empty.Header>
          <Empty.Media variant="icon">
            <Key />
          </Empty.Media>
        </Empty.Header>
        <Empty.Title>{$LL.auth.passkey.noPasskeys()}</Empty.Title>
        <Empty.Content>
          <Button
            data-testid="add-passkey-button-empty"
            onclick={startPasskeyRegistration}
            disabled={isRegistering}
            class="mt-4"
          >
            {isRegistering ? $LL.auth.passkey.adding() : $LL.auth.passkey.addPasskey()}
          </Button>
        </Empty.Content>
      </Empty.Root>
    {:else}
      <div class="space-y-4">
        {#each data.passkeys as passkey (passkey.id)}
          {@const deleteForm = deletePasskeyForm.for(passkey.id)}
          {@const renameForm = renamePasskeyForm.for(passkey.id)}
          {@const isEditing = editingPasskeyId === passkey.id}
          <Item.Root variant="outline">
            <Item.Media variant="icon">
              <Key />
            </Item.Media>
            <Item.Content>
              {#if isEditing}
                <form
                  class="space-y-2"
                  {...renameForm.enhance(async ({ submit }) => {
                    await submit();
                    await invalidateAll();
                    editingPasskeyId = null;
                  })}
                >
                  <input type="hidden" name="passkeyId" value={passkey.id} />
                  <div>
                    <Label for="rename-{passkey.id}">{$LL.auth.passkey.deviceName()}</Label>
                    <Input
                      id="rename-{passkey.id}"
                      type="text"
                      name="deviceName"
                      value={passkey.deviceName}
                      class="mt-1"
                      onkeydown={(e) => {
                        if (e.key === "Escape") {
                          editingPasskeyId = null;
                        }
                      }}
                    />
                  </div>
                  <div class="flex gap-2">
                    <Button type="submit" size="sm" disabled={!!renameForm.pending}>
                      <Check class="mr-1 h-3 w-3" />
                      {$LL.auth.passkey.save()}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onclick={() => (editingPasskeyId = null)}>
                      <X class="mr-1 h-3 w-3" />
                      {$LL.auth.passkey.cancel()}
                    </Button>
                  </div>
                </form>
              {:else}
                <Item.Title>
                  <span>{passkey.deviceName}</span>
                  {#if passkey.backedUp}
                    <Badge variant="secondary" class="gap-1">
                      <Shield class="h-3 w-3" />
                      {$LL.auth.passkey.synced()}
                    </Badge>
                  {/if}
                </Item.Title>
                <Item.Description class="flex flex-col gap-1">
                  <span class="flex flex-col gap-1 sm:flex-row sm:gap-4">
                    <span class="flex items-center gap-1">
                      <Clock class="size-4" />
                      {$LL.auth.passkey.createdAt()}: {formatDate(passkey.createdAt)}
                    </span>
                    <span class="flex items-center gap-1">
                      <Clock class="size-4" />
                      {$LL.auth.passkey.lastUsedAt()}: {formatDate(passkey.lastUsedAt)}
                    </span>
                  </span>
                  {#if passkey.transports && passkey.transports.length > 0}
                    <span>
                      {$LL.auth.passkey.transports()}: {passkey.transports.join(", ")}
                    </span>
                  {/if}
                </Item.Description>
              {/if}
            </Item.Content>
            {#if !isEditing}
              <Item.Actions class="flex-col sm:flex-row">
                <Button variant="ghost" size="sm" onclick={() => (editingPasskeyId = passkey.id)}>
                  <Pencil />
                  <span>{$LL.auth.passkey.rename()}</span>
                </Button>
                <form
                  class="contents"
                  {...deleteForm.enhance(async ({ submit }) => {
                    await submit();
                    await invalidateAll();
                  })}
                >
                  <input type="hidden" name="passkeyId" value={passkey.id} />
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    disabled={!!deleteForm.pending}
                    onclick={(e) => {
                      if (!confirm($LL.auth.passkey.deleteConfirm())) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <Trash2 />
                    <span>{$LL.auth.passkey.deletePasskey()}</span>
                  </Button>
                </form>
              </Item.Actions>
            {/if}
          </Item.Root>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
