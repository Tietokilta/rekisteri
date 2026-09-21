<script lang="ts">
  import { LL } from "$lib/i18n/i18n-svelte";
  import { Input } from "$lib/components/ui/input";
  import * as Tabs from "$lib/components/ui/tabs";
  import type { PageData } from "../$types";

  let {
    values = $bindable(),
    errors,
    useCustomAccentColor = $bindable(),
    accentColorInputValue = $bindable(),
    removeImages = $bindable(),
    data,
    getImageUrl,
    toggleRemove,
    fileInputClass,
  }: {
    values: Record<string, string>;
    errors: Record<string, string | undefined>;
    useCustomAccentColor: boolean;
    accentColorInputValue: string;
    removeImages: Record<"logo" | "logoDark" | "favicon" | "faviconDark", boolean>;
    data: PageData;
    getImageUrl: (type: keyof typeof data.customImageExists) => string | null;
    toggleRemove: (type: "logo" | "logoDark" | "favicon" | "faviconDark") => void;
    fileInputClass: string;
  } = $props();
</script>

<Tabs.Content value="branding" class="mt-4 space-y-4">
  <div class="rounded-xl border border-border/60 bg-card p-5 shadow-xs">
    <h3 class="mb-3 text-base font-semibold text-foreground">
      {$LL.admin.settings.brandingDefaults.title()}
    </h3>

    <div class="space-y-4">
      <!-- Accent Color -->
      <div>
        <label for="accentColor" class="block text-sm font-medium text-foreground">
          {$LL.admin.settings.brandingDefaults.accentColor()}
        </label>
        <p class="mt-1 text-sm text-muted-foreground">
          {$LL.admin.settings.brandingDefaults.accentColorDescription()}
        </p>

        <label class="mt-3 flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            bind:checked={useCustomAccentColor}
            class="rounded border-gray-300 text-primary focus:ring-primary"
          />
          {$LL.admin.settings.brandingDefaults.useAccentColor()}
        </label>

        {#if useCustomAccentColor}
          <div class="mt-3 flex items-center gap-4">
            <input
              type="color"
              name="accentColor"
              id="accentColor"
              bind:value={accentColorInputValue}
              class="h-10 w-20 cursor-pointer rounded border-border bg-background shadow-xs focus:border-ring focus:ring-ring sm:text-sm"
            />
            <code class="rounded bg-muted px-2 py-1 font-mono text-sm">{accentColorInputValue}</code>
          </div>
        {:else}
          <p class="mt-3 text-sm text-muted-foreground">
            {$LL.admin.settings.brandingDefaults.defaultAccentColor()}
          </p>
        {/if}
        {#if errors.accentColor}
          <p class="mt-2 text-sm text-red-600">{errors.accentColor}</p>
        {/if}
      </div>

      <!-- App Name (Localized) -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label for="appNameFI" class="block text-sm font-medium text-foreground">
            {$LL.admin.settings.brandingDefaults.appNameFi()}
          </label>
          <div class="mt-1.5">
            <Input type="text" name="appNameFi" id="appNameFI" bind:value={values.appNameFi} class="w-full" />
          </div>
          {#if errors.appNameFi}<p class="mt-2 text-sm text-red-600">{errors.appNameFi}</p>{/if}
        </div>

        <div>
          <label for="appNameEN" class="block text-sm font-medium text-foreground">
            {$LL.admin.settings.brandingDefaults.appNameEn()}
          </label>
          <div class="mt-1.5">
            <Input type="text" name="appNameEn" id="appNameEN" bind:value={values.appNameEn} class="w-full" />
          </div>
          {#if errors.appNameEn}<p class="mt-2 text-sm text-red-600">{errors.appNameEn}</p>{/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Images / Logos Card -->
  <div class="rounded-xl border border-border/60 bg-card p-5 shadow-xs">
    <h3 class="mb-3 text-base font-semibold text-foreground">
      {$LL.admin.settings.images.title()}
    </h3>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <!-- Logo -->
      <div>
        <label for="logo" class="mb-1 block text-sm font-medium text-foreground">
          {$LL.admin.settings.images.logoLight()}
        </label>
        <input type="file" name="logo" id="logo" accept="image/svg+xml" class={fileInputClass} />
        {#if data.customImageExists.logo}
          {#if getImageUrl("logo")}
            <div class="mt-2 text-xs text-muted-foreground">
              {$LL.admin.settings.images.current()}
              <img
                src={getImageUrl("logo")}
                alt="Current Logo"
                class="ml-2 inline-block h-8 rounded bg-gray-100 object-contain p-1"
              />
            </div>
          {/if}
          <button
            type="button"
            onclick={() => toggleRemove("logo")}
            class="mt-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            {removeImages.logo ? $LL.common.cancel() : $LL.common.delete()}
          </button>
        {/if}
        {#if errors.logo}<p class="mt-2 text-xs text-red-600">{errors.logo}</p>{/if}
      </div>

      <!-- Logo Dark -->
      <div>
        <label for="logoDark" class="mb-1 block text-sm font-medium text-foreground">
          {$LL.admin.settings.images.logoDark()}
        </label>
        <input type="file" name="logoDark" id="logoDark" accept="image/svg+xml" class={fileInputClass} />
        {#if data.customImageExists.logoDark}
          {#if getImageUrl("logoDark")}
            <div class="mt-2 text-xs text-muted-foreground">
              {$LL.admin.settings.images.current()}
              <img
                src={getImageUrl("logoDark")}
                alt="Current Logo Dark"
                class="ml-2 inline-block h-8 rounded bg-gray-900 object-contain p-1"
              />
            </div>
          {/if}
          <button
            type="button"
            onclick={() => toggleRemove("logoDark")}
            class="mt-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            {removeImages.logoDark ? $LL.common.cancel() : $LL.common.delete()}
          </button>
        {/if}
        {#if errors.logoDark}<p class="mt-2 text-xs text-red-600">{errors.logoDark}</p>{/if}
      </div>

      <!-- Favicon -->
      <div>
        <label for="favicon" class="mb-1 block text-sm font-medium text-foreground">
          {$LL.admin.settings.images.faviconLight()}
        </label>
        <input type="file" name="favicon" id="favicon" accept="image/png" class={fileInputClass} />
        {#if data.customImageExists.favicon}
          {#if getImageUrl("favicon")}
            <div class="mt-2 text-xs text-muted-foreground">
              {$LL.admin.settings.images.current()}
              <img
                src={getImageUrl("favicon")}
                alt="Current Favicon"
                class="ml-2 inline-block h-8 w-8 rounded bg-gray-100 object-contain p-1"
              />
            </div>
          {/if}
          <button
            type="button"
            onclick={() => toggleRemove("favicon")}
            class="mt-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            {removeImages.favicon ? $LL.common.cancel() : $LL.common.delete()}
          </button>
        {/if}
        {#if errors.favicon}<p class="mt-2 text-xs text-red-600">{errors.favicon}</p>{/if}
      </div>

      <!-- Favicon Dark -->
      <div>
        <label for="faviconDark" class="mb-1 block text-sm font-medium text-foreground">
          {$LL.admin.settings.images.faviconDark()}
        </label>
        <input type="file" name="faviconDark" id="faviconDark" accept="image/png" class={fileInputClass} />
        {#if data.customImageExists.faviconDark}
          {#if getImageUrl("faviconDark")}
            <div class="mt-2 text-xs text-muted-foreground">
              {$LL.admin.settings.images.current()}
              <img
                src={getImageUrl("faviconDark")}
                alt="Current Favicon Dark"
                class="ml-2 inline-block h-8 w-8 rounded bg-gray-900 object-contain p-1"
              />
            </div>
          {/if}
          <button
            type="button"
            onclick={() => toggleRemove("faviconDark")}
            class="mt-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            {removeImages.faviconDark ? $LL.common.cancel() : $LL.common.delete()}
          </button>
        {/if}
        {#if errors.faviconDark}<p class="mt-2 text-xs text-red-600">{errors.faviconDark}</p>{/if}
      </div>
    </div>
  </div>
</Tabs.Content>
