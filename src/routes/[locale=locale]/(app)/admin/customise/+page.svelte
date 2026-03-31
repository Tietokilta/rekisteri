<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData, ActionData } from "./$types";
  import { LL } from "$lib/i18n/i18n-svelte";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import { Input } from "$lib/components/ui/input";
  import MarkdownEditor from "$lib/components/markdown-editor.svelte";
  import { toast } from "svelte-sonner";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Use $state for form values, initialized to empty then synced via effect
  let values = $state({} as typeof data.values);

  // Svelte 5: Sync state when data or form changes (e.g. after successful save or locale change)
  // This avoids the "state_referenced_locally" warning and ensures UI reflects server updates.
  $effect(() => {
    const newValues = { ...data.values, ...form?.values };
    Object.assign(values, newValues);
  });

  let errors = $derived(form?.errors ?? {});

  // Pending removals are only persisted when the form is saved.
  let removeImages = $state({
    logo: false,
    logoDark: false,
    favicon: false,
    faviconDark: false,
  });

  // Helper to get image URL with cache-buster if it exists and is not queued for removal
  const getImageUrl = (type: keyof typeof data.hasImages) =>
    data.hasImages[type] && !removeImages[type] ? `/api/image/${type}?v=${Date.now()}` : null;

  function toggleRemove(type: keyof typeof removeImages) {
    removeImages[type] = !removeImages[type];
  }
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
  <AdminPageHeader title={$LL.admin.customise.title()} description={$LL.admin.customise.description()} />

  <div class="space-y-6">
    <form
      method="POST"
      enctype="multipart/form-data"
      use:enhance={() => {
        return async ({ result }) => {
          if (result.type === "success") {
            const data = result.data as { message?: string };
            toast.success(data?.message || $LL.admin.customise.success());
          } else if (result.type === "failure") {
            const data = result.data as { message?: string };
            toast.error(data?.message || $LL.admin.customise.error());
          }
        };
      }}
      class="space-y-8"
    >
      {#if removeImages.logo}<input type="hidden" name="removeLogo" value="true" />{/if}
      {#if removeImages.logoDark}<input type="hidden" name="removeLogoDark" value="true" />{/if}
      {#if removeImages.favicon}<input type="hidden" name="removeFavicon" value="true" />{/if}
      {#if removeImages.faviconDark}<input type="hidden" name="removeFaviconDark" value="true" />{/if}

      <!-- Branding Section -->
      <div class="border-b border-gray-200 pb-6 dark:border-gray-700">
        <h4 class="mb-4 text-base font-medium text-gray-900 dark:text-gray-100">
          {$LL.admin.customise.brandingDefaults.title()}
        </h4>

        <div class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <!-- Accent Color -->
          <div class="sm:col-span-1">
            <label for="accentColor" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.brandingDefaults.accentColor()}
            </label>
            <div class="mt-1 flex items-center gap-4">
              <input
                type="color"
                name="accentColor"
                id="accentColor"
                bind:value={values.accentColor}
                class="h-10 w-20 cursor-pointer rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
              <code class="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-900">{values.accentColor}</code>
            </div>
            {#if errors.accentColor}
              <p class="mt-2 text-sm text-red-600">{errors.accentColor}</p>
            {/if}
          </div>
        </div>

        <!-- App Name (Localized) -->
        <div class="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div class="sm:col-span-1">
            <label for="appNameFI" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.brandingDefaults.appNameFi()}
            </label>
            <div class="mt-1">
              <Input type="text" name="appNameFi" id="appNameFI" bind:value={values.appNameFi} class="max-w-md" />
            </div>
            {#if errors.appNameFi}<p class="mt-2 text-sm text-red-600">{errors.appNameFi}</p>{/if}
          </div>

          <div class="sm:col-span-1">
            <label for="appNameEN" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.brandingDefaults.appNameEn()}
            </label>
            <div class="mt-1">
              <Input type="text" name="appNameEn" id="appNameEN" bind:value={values.appNameEn} class="max-w-md" />
            </div>
            {#if errors.appNameEn}<p class="mt-2 text-sm text-red-600">{errors.appNameEn}</p>{/if}
          </div>
        </div>
      </div>

      <!-- Organization Details Section -->
      <div class="border-b border-gray-200 pb-6 dark:border-gray-700">
        <h4 class="mb-4 text-base font-medium text-gray-900 dark:text-gray-100">
          {$LL.admin.customise.organizationDetails.title()}
        </h4>

        <div class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div class="sm:col-span-1">
            <label for="orgNameFI" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.organizationDetails.nameFi()}
            </label>
            <div class="mt-1">
              <Input
                type="text"
                name="organizationNameFi"
                id="orgNameFI"
                bind:value={values.organizationNameFi}
                class="max-w-md"
              />
            </div>
            {#if errors.organizationNameFi}<p class="mt-2 text-sm text-red-600">{errors.organizationNameFi}</p>{/if}
          </div>

          <div class="sm:col-span-1">
            <label for="orgNameEN" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.organizationDetails.nameEn()}
            </label>
            <div class="mt-1">
              <Input
                type="text"
                name="organizationNameEn"
                id="orgNameEN"
                bind:value={values.organizationNameEn}
                class="max-w-md"
              />
            </div>
            {#if errors.organizationNameEn}<p class="mt-2 text-sm text-red-600">{errors.organizationNameEn}</p>{/if}
          </div>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div class="sm:col-span-1">
            <label for="orgNameShortFI" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.organizationDetails.nameShortFi()}
            </label>
            <div class="mt-1">
              <Input
                type="text"
                name="organizationNameShortFi"
                id="orgNameShortFI"
                bind:value={values.organizationNameShortFi}
                class="max-w-md"
              />
            </div>
            {#if errors.organizationNameShortFi}<p class="mt-2 text-sm text-red-600">
                {errors.organizationNameShortFi}
              </p>{/if}
          </div>

          <div class="sm:col-span-1">
            <label for="orgNameShortEN" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.organizationDetails.nameShortEn()}
            </label>
            <div class="mt-1">
              <Input
                type="text"
                name="organizationNameShortEn"
                id="orgNameShortEN"
                bind:value={values.organizationNameShortEn}
                class="max-w-md"
              />
            </div>
            {#if errors.organizationNameShortEn}<p class="mt-2 text-sm text-red-600">
                {errors.organizationNameShortEn}
              </p>{/if}
          </div>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div class="sm:col-span-1">
            <label for="businessId" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.organizationDetails.businessId()}
            </label>
            <div class="mt-1">
              <Input type="text" name="businessId" id="businessId" bind:value={values.businessId} class="max-w-md" />
            </div>
            {#if errors.businessId}<p class="mt-2 text-sm text-red-600">{errors.businessId}</p>{/if}
          </div>

          <div class="sm:col-span-1">
            <label for="overseerContact" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.organizationDetails.overseerContact()}
            </label>
            <div class="mt-1">
              <Input
                type="email"
                name="overseerContact"
                id="overseerContact"
                bind:value={values.overseerContact}
                class="max-w-md"
              />
            </div>
            {#if errors.overseerContact}<p class="mt-2 text-sm text-red-600">{errors.overseerContact}</p>{/if}
          </div>
        </div>

        <div class="mt-6 sm:col-span-2">
          <label for="overseerAddress" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {$LL.admin.customise.organizationDetails.overseerAddress()}
          </label>
          <div class="mt-1">
            <Input
              type="text"
              name="overseerAddress"
              id="overseerAddress"
              bind:value={values.overseerAddress}
              class="max-w-xl"
            />
          </div>
          {#if errors.overseerAddress}<p class="mt-2 text-sm text-red-600">{errors.overseerAddress}</p>{/if}
        </div>

        <div class="mt-6 sm:col-span-2">
          <label for="rulesUrl" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {$LL.admin.customise.organizationDetails.organizationRulesUrl()}
          </label>
          <div class="mt-1">
            <Input
              type="url"
              name="organizationRulesUrl"
              id="rulesUrl"
              bind:value={values.organizationRulesUrl}
              class="max-w-xl"
            />
          </div>
          {#if errors.organizationRulesUrl}<p class="mt-2 text-sm text-red-600">{errors.organizationRulesUrl}</p>{/if}
        </div>
      </div>

      <!-- Resignation Rules Section -->
      <div class="border-b border-gray-200 pb-6 dark:border-gray-700">
        <h4 class="mb-4 text-base font-medium text-gray-900 dark:text-gray-100">
          {$LL.admin.customise.resignation.title()}
        </h4>

        <div class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div class="sm:col-span-1">
            <label for="memberResignRule" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.resignation.rule()}
            </label>
            <div class="mt-1">
              <Input
                type="text"
                name="memberResignRule"
                id="memberResignRule"
                bind:value={values.memberResignRule}
                class="max-w-md"
              />
            </div>
            {#if errors.memberResignRule}<p class="mt-2 text-sm text-red-600">{errors.memberResignRule}</p>{/if}
          </div>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div class="sm:col-span-1">
            <label for="memberResignDefaultReasonFi" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.resignation.defaultReasonFi()}
            </label>
            <div class="mt-1">
              <Input
                type="text"
                name="memberResignDefaultReasonFi"
                id="memberResignDefaultReasonFi"
                bind:value={values.memberResignDefaultReasonFi}
                class="max-w-md"
              />
            </div>
            {#if errors.memberResignDefaultReasonFi}<p class="mt-2 text-sm text-red-600">
                {errors.memberResignDefaultReasonFi}
              </p>{/if}
          </div>

          <div class="sm:col-span-1">
            <label for="memberResignDefaultReasonEn" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.resignation.defaultReasonEn()}
            </label>
            <div class="mt-1">
              <Input
                type="text"
                name="memberResignDefaultReasonEn"
                id="memberResignDefaultReasonEn"
                bind:value={values.memberResignDefaultReasonEn}
                class="max-w-md"
              />
            </div>
            {#if errors.memberResignDefaultReasonEn}<p class="mt-2 text-sm text-red-600">
                {errors.memberResignDefaultReasonEn}
              </p>{/if}
          </div>
        </div>
      </div>

      <!-- Privacy Policy Section (Markdown) -->
      <div class="border-b border-gray-200 pb-6 dark:border-gray-700">
        <h4 class="mb-4 text-base font-medium text-gray-900 dark:text-gray-100">
          {$LL.admin.customise.privacyPolicy.title()}
        </h4>

        <div class="space-y-6">
          <div>
            <label for="privacyPolicyFI" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.privacyPolicy.fi()}
            </label>
            <MarkdownEditor id="privacyPolicyFI" bind:value={values.privacyPolicyFi} />
            <input type="hidden" name="privacyPolicyFi" bind:value={values.privacyPolicyFi} />
            {#if errors.privacyPolicyFi}
              <p class="mt-2 text-sm text-red-600">{errors.privacyPolicyFi}</p>
            {/if}
          </div>

          <div>
            <label for="privacyPolicyEN" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.privacyPolicy.en()}
            </label>
            <MarkdownEditor id="privacyPolicyEN" bind:value={values.privacyPolicyEn} />
            <input type="hidden" name="privacyPolicyEn" bind:value={values.privacyPolicyEn} />
            {#if errors.privacyPolicyEn}
              <p class="mt-2 text-sm text-red-600">{errors.privacyPolicyEn}</p>
            {/if}
          </div>
        </div>
      </div>

      <!-- Images Section -->
      <div class="border-b border-gray-200 pb-6 dark:border-gray-700">
        <h4 class="mb-4 text-base font-medium text-gray-900 dark:text-gray-100">
          {$LL.admin.customise.images.title()}
        </h4>

        <div class="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2">
          <!-- Logo -->
          <div>
            <label for="logo" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.images.logoLight()}
            </label>
            <input
              type="file"
              name="logo"
              id="logo"
              accept="image/svg+xml"
              class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 dark:text-gray-400 dark:file:bg-gray-700 dark:file:text-gray-300"
            />
            {#if data.hasImages.logo}
              {#if getImageUrl("logo")}
                <div class="mt-2 text-xs text-gray-500">
                  {$LL.admin.customise.images.current()}
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
            <label for="logoDark" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.images.logoDark()}
            </label>
            <input
              type="file"
              name="logoDark"
              id="logoDark"
              accept="image/svg+xml"
              class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 dark:text-gray-400 dark:file:bg-gray-700 dark:file:text-gray-300"
            />
            {#if data.hasImages.logoDark}
              {#if getImageUrl("logoDark")}
                <div class="mt-2 text-xs text-gray-500">
                  {$LL.admin.customise.images.current()}
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
            <label for="favicon" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.images.faviconLight()}
            </label>
            <input
              type="file"
              name="favicon"
              id="favicon"
              accept="image/png"
              class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 dark:text-gray-400 dark:file:bg-gray-700 dark:file:text-gray-300"
            />
            {#if data.hasImages.favicon}
              {#if getImageUrl("favicon")}
                <div class="mt-2 text-xs text-gray-500">
                  {$LL.admin.customise.images.current()}
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
            <label for="faviconDark" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {$LL.admin.customise.images.faviconDark()}
            </label>
            <input
              type="file"
              name="faviconDark"
              id="faviconDark"
              accept="image/png"
              class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 dark:text-gray-400 dark:file:bg-gray-700 dark:file:text-gray-300"
            />
            {#if data.hasImages.faviconDark}
              {#if getImageUrl("faviconDark")}
                <div class="mt-2 text-xs text-gray-500">
                  {$LL.admin.customise.images.current()}
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

      <!-- Actions -->
      <div class="pt-5">
        <div class="flex justify-end">
          <button
            type="submit"
            class="ml-3 inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
            data-testid="save-customisations"
          >
            {$LL.admin.customise.save()}
          </button>
        </div>
      </div>
    </form>
  </div>
</main>
