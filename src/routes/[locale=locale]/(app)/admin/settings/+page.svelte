<script lang="ts">
  import type { PageData } from "./$types";
  import { LL } from "$lib/i18n/i18n-svelte";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import MarkdownEditor from "$lib/components/markdown-editor.svelte";
  import * as Tabs from "$lib/components/ui/tabs";
  import { toast } from "svelte-sonner";
  import { updateCustomization } from "./data.remote";
  import { updateCustomizationSchema } from "./schema";
  import Palette from "@lucide/svelte/icons/palette";
  import Building2 from "@lucide/svelte/icons/building-2";
  import UserX from "@lucide/svelte/icons/user-x";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";

  type CustomizationValueKey = keyof PageData["values"];

  const DEFAULT_ACCENT_COLOR = "#171717";
  const fileInputClass =
    "block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20 dark:text-gray-400 dark:file:bg-gray-700 dark:file:text-gray-300";

  const CUSTOMIZATION_VALUE_FIELDS = [
    "accentColor",
    "organizationNameFi",
    "organizationNameEn",
    "organizationLegalNameFi",
    "organizationLegalNameEn",
    "appNameFi",
    "appNameEn",
    "businessId",
    "overseerContact",
    "overseerAddress",
    "privacyPolicyFi",
    "privacyPolicyEn",
    "organizationRulesUrl",
    "memberResignRule",
    "memberResignDefaultReasonFi",
    "memberResignDefaultReasonEn",
  ] as const satisfies readonly CustomizationValueKey[];

  let { data }: { data: PageData } = $props();

  let activeTab = $state("branding");

  function firstIssue(issues: { message: string }[] | undefined) {
    return issues?.[0]?.message;
  }

  function getCurrentValues() {
    const submitted = updateCustomization.fields.value();
    const currentValues = { ...data.values };

    for (const field of CUSTOMIZATION_VALUE_FIELDS) {
      const submittedValue = submitted[field];
      if (typeof submittedValue === "string") {
        currentValues[field] = submittedValue;
      }
    }

    return currentValues;
  }

  // Local values bound to controls
  let values = $state(getCurrentValues());
  let useCustomAccentColor = $state(Boolean(values.accentColor));
  let accentColorInputValue = $state(values.accentColor || DEFAULT_ACCENT_COLOR);

  $effect(() => {
    const currentValues = { ...data.values };
    Object.assign(values, currentValues);
    useCustomAccentColor = Boolean(currentValues.accentColor);
    accentColorInputValue = currentValues.accentColor || DEFAULT_ACCENT_COLOR;
  });

  let errors = $derived({
    accentColor: firstIssue(updateCustomization.fields.accentColor.issues()),
    organizationNameFi: firstIssue(updateCustomization.fields.organizationNameFi.issues()),
    organizationNameEn: firstIssue(updateCustomization.fields.organizationNameEn.issues()),
    organizationLegalNameFi: firstIssue(updateCustomization.fields.organizationLegalNameFi.issues()),
    organizationLegalNameEn: firstIssue(updateCustomization.fields.organizationLegalNameEn.issues()),
    appNameFi: firstIssue(updateCustomization.fields.appNameFi.issues()),
    appNameEn: firstIssue(updateCustomization.fields.appNameEn.issues()),
    businessId: firstIssue(updateCustomization.fields.businessId.issues()),
    overseerContact: firstIssue(updateCustomization.fields.overseerContact.issues()),
    overseerAddress: firstIssue(updateCustomization.fields.overseerAddress.issues()),
    privacyPolicyFi: firstIssue(updateCustomization.fields.privacyPolicyFi.issues()),
    privacyPolicyEn: firstIssue(updateCustomization.fields.privacyPolicyEn.issues()),
    organizationRulesUrl: firstIssue(updateCustomization.fields.organizationRulesUrl.issues()),
    memberResignRule: firstIssue(updateCustomization.fields.memberResignRule.issues()),
    memberResignDefaultReasonFi: firstIssue(updateCustomization.fields.memberResignDefaultReasonFi.issues()),
    memberResignDefaultReasonEn: firstIssue(updateCustomization.fields.memberResignDefaultReasonEn.issues()),
    logo: firstIssue(updateCustomization.fields.logo.issues()),
    logoDark: firstIssue(updateCustomization.fields.logoDark.issues()),
    favicon: firstIssue(updateCustomization.fields.favicon.issues()),
    faviconDark: firstIssue(updateCustomization.fields.faviconDark.issues()),
  });

  let rootErrors = $derived(updateCustomization.fields.allIssues()?.filter((issue) => issue.path.length === 0) ?? []);

  let hasBrandingErrors = $derived(
    Boolean(
      errors.accentColor ||
      errors.appNameFi ||
      errors.appNameEn ||
      errors.logo ||
      errors.logoDark ||
      errors.favicon ||
      errors.faviconDark,
    ),
  );

  let hasOrganizationErrors = $derived(
    Boolean(
      errors.organizationNameFi ||
      errors.organizationNameEn ||
      errors.organizationLegalNameFi ||
      errors.organizationLegalNameEn ||
      errors.businessId ||
      errors.overseerContact ||
      errors.overseerAddress ||
      errors.organizationRulesUrl,
    ),
  );

  let hasResignationErrors = $derived(
    Boolean(errors.memberResignRule || errors.memberResignDefaultReasonFi || errors.memberResignDefaultReasonEn),
  );

  let hasPrivacyErrors = $derived(Boolean(errors.privacyPolicyFi || errors.privacyPolicyEn));

  // Pending removals are only persisted when the form is saved.
  let removeImages = $state({
    logo: false,
    logoDark: false,
    favicon: false,
    faviconDark: false,
  });

  const imageUrls = {
    logo: "/api/image/logo.svg",
    logoDark: "/api/image/logo-dark.svg",
    favicon: "/api/image/favicon.png",
    faviconDark: "/api/image/favicon-dark.png",
  } satisfies Record<keyof typeof data.customImageExists, string>;

  // Helper to get image URL with cache-buster if it exists and is not queued for removal
  const getImageUrl = (type: keyof typeof data.customImageExists) =>
    data.customImageExists[type] && !removeImages[type] ? `${imageUrls[type]}?v=${data.imageVersion}` : null;

  function toggleRemove(type: keyof typeof removeImages) {
    removeImages[type] = !removeImages[type];
  }

  function clearImageRemovals() {
    removeImages.logo = false;
    removeImages.logoDark = false;
    removeImages.favicon = false;
    removeImages.faviconDark = false;
  }
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
  <AdminPageHeader title={$LL.admin.settings.title()} description={$LL.admin.settings.description()}>
    {#snippet actions()}
      <div class="flex items-center gap-3">
        {#each rootErrors as issue, i (i)}
          <p class="text-sm text-red-600">{issue.message}</p>
        {/each}
        <Button
          type="submit"
          form="customization-form"
          data-testid="save-customizations"
          disabled={!data.canWrite || !!updateCustomization.pending}
        >
          {$LL.admin.settings.save()}
        </Button>
      </div>
    {/snippet}
  </AdminPageHeader>

  <Tabs.Root bind:value={activeTab} class="mt-4 w-full">
    <Tabs.List class="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1.5 items-center md:grid-cols-5 h-auto">
      <Tabs.Trigger value="branding" data-testid="tab-branding" class="relative">
        <Palette class="size-4" />
        <span>{$LL.admin.settings.tabs.branding()}</span>
        {#if hasBrandingErrors}
          <span class="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500"></span>
        {/if}
      </Tabs.Trigger>

      <Tabs.Trigger value="organization" data-testid="tab-organization" class="relative">
        <Building2 class="size-4" />
        <span>{$LL.admin.settings.tabs.organization()}</span>
        {#if hasOrganizationErrors}
          <span class="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500"></span>
        {/if}
      </Tabs.Trigger>

      <Tabs.Trigger value="resignation" data-testid="tab-resignation" class="relative">
        <UserX class="size-4" />
        <span>{$LL.admin.settings.tabs.resignation()}</span>
        {#if hasResignationErrors}
          <span class="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500"></span>
        {/if}
      </Tabs.Trigger>

      <Tabs.Trigger value="privacyPolicy" data-testid="tab-privacy-policy" class="relative">
        <ShieldCheck class="size-4" />
        <span>{$LL.admin.settings.tabs.privacyPolicy()}</span>
        {#if hasPrivacyErrors}
          <span class="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500"></span>
        {/if}
      </Tabs.Trigger>
    </Tabs.List>

    <!-- FORM FOR GENERAL SETTINGS (TABS 1-4) -->
    <form
      id="customization-form"
      {...updateCustomization.preflight(updateCustomizationSchema).enhance(async ({ submit }) => {
        try {
          await submit();
        } catch {
          toast.error($LL.admin.settings.error());
          return;
        }

        if (updateCustomization.fields.allIssues()?.length) {
          if (hasBrandingErrors) activeTab = "branding";
          else if (hasOrganizationErrors) activeTab = "organization";
          else if (hasResignationErrors) activeTab = "resignation";
          else if (hasPrivacyErrors) activeTab = "privacyPolicy";

          toast.error($LL.admin.settings.error());
          return;
        }

        clearImageRemovals();
        values.accentColor = useCustomAccentColor ? accentColorInputValue : "";
        toast.success(updateCustomization.result?.message || $LL.admin.settings.success());
      })}
      enctype="multipart/form-data"
      class="mt-4 space-y-4"
    >
      {#if removeImages.logo}<input type="hidden" name="removeLogo" value="true" />{/if}
      {#if removeImages.logoDark}<input type="hidden" name="removeLogoDark" value="true" />{/if}
      {#if removeImages.favicon}<input type="hidden" name="removeFavicon" value="true" />{/if}
      {#if removeImages.faviconDark}<input type="hidden" name="removeFaviconDark" value="true" />{/if}

      <!-- TAB 1: Branding & Appearance -->
      <Tabs.Content value="branding" class="space-y-4 mt-4">
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
                  <code class="rounded bg-muted px-2 py-1 text-sm font-mono">{accentColorInputValue}</code>
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

      <!-- TAB 2: Organization Details -->
      <Tabs.Content value="organization" class="mt-4">
        <div class="rounded-xl border border-border/60 bg-card p-5 shadow-xs">
          <h3 class="mb-3 text-base font-semibold text-foreground">
            {$LL.admin.settings.organizationDetails.title()}
          </h3>

          <div class="space-y-4">
            <!-- Organization Names -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label for="orgNameFI" class="block text-sm font-medium text-foreground">
                  {$LL.admin.settings.organizationDetails.nameFi()}
                </label>
                <div class="mt-1.5">
                  <Input
                    type="text"
                    name="organizationNameFi"
                    id="orgNameFI"
                    bind:value={values.organizationNameFi}
                    class="w-full"
                  />
                </div>
                {#if errors.organizationNameFi}<p class="mt-2 text-sm text-red-600">{errors.organizationNameFi}</p>{/if}
              </div>

              <div>
                <label for="orgNameEN" class="block text-sm font-medium text-foreground">
                  {$LL.admin.settings.organizationDetails.nameEn()}
                </label>
                <div class="mt-1.5">
                  <Input
                    type="text"
                    name="organizationNameEn"
                    id="orgNameEN"
                    bind:value={values.organizationNameEn}
                    class="w-full"
                  />
                </div>
                {#if errors.organizationNameEn}<p class="mt-2 text-sm text-red-600">{errors.organizationNameEn}</p>{/if}
              </div>
            </div>

            <!-- Legal Names -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label for="orgLegalNameFI" class="block text-sm font-medium text-foreground">
                  {$LL.admin.settings.organizationDetails.legalNameFi()}
                </label>
                <div class="mt-1.5">
                  <Input
                    type="text"
                    name="organizationLegalNameFi"
                    id="orgLegalNameFI"
                    bind:value={values.organizationLegalNameFi}
                    class="w-full"
                  />
                </div>
                {#if errors.organizationLegalNameFi}<p class="mt-2 text-sm text-red-600">
                    {errors.organizationLegalNameFi}
                  </p>{/if}
              </div>

              <div>
                <label for="orgLegalNameEN" class="block text-sm font-medium text-foreground">
                  {$LL.admin.settings.organizationDetails.legalNameEn()}
                </label>
                <div class="mt-1.5">
                  <Input
                    type="text"
                    name="organizationLegalNameEn"
                    id="orgLegalNameEN"
                    bind:value={values.organizationLegalNameEn}
                    class="w-full"
                  />
                </div>
                {#if errors.organizationLegalNameEn}<p class="mt-2 text-sm text-red-600">
                    {errors.organizationLegalNameEn}
                  </p>{/if}
              </div>
            </div>

            <!-- Business ID & Contact Email -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label for="businessId" class="block text-sm font-medium text-foreground">
                  {$LL.admin.settings.organizationDetails.businessId()}
                </label>
                <div class="mt-1.5">
                  <Input type="text" name="businessId" id="businessId" bind:value={values.businessId} class="w-full" />
                </div>
                {#if errors.businessId}<p class="mt-2 text-sm text-red-600">{errors.businessId}</p>{/if}
              </div>

              <div>
                <label for="overseerContact" class="block text-sm font-medium text-foreground">
                  {$LL.admin.settings.organizationDetails.overseerContact()}
                </label>
                <div class="mt-1.5">
                  <Input
                    type="email"
                    name="overseerContact"
                    id="overseerContact"
                    bind:value={values.overseerContact}
                    class="w-full"
                  />
                </div>
                {#if errors.overseerContact}<p class="mt-2 text-sm text-red-600">{errors.overseerContact}</p>{/if}
              </div>
            </div>

            <!-- Overseer Address & Rules URL -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label for="overseerAddress" class="block text-sm font-medium text-foreground">
                  {$LL.admin.settings.organizationDetails.overseerAddress()}
                </label>
                <div class="mt-1.5">
                  <Input
                    type="text"
                    name="overseerAddress"
                    id="overseerAddress"
                    bind:value={values.overseerAddress}
                    class="w-full"
                  />
                </div>
                {#if errors.overseerAddress}<p class="mt-2 text-sm text-red-600">{errors.overseerAddress}</p>{/if}
              </div>

              <div>
                <label for="rulesUrl" class="block text-sm font-medium text-foreground">
                  {$LL.admin.settings.organizationDetails.organizationRulesUrl()}
                </label>
                <div class="mt-1.5">
                  <Input
                    type="url"
                    name="organizationRulesUrl"
                    id="rulesUrl"
                    bind:value={values.organizationRulesUrl}
                    class="w-full"
                  />
                </div>
                {#if errors.organizationRulesUrl}
                  <p class="mt-2 text-sm text-red-600">{errors.organizationRulesUrl}</p>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </Tabs.Content>

      <!-- TAB 3: Resignation & Rules -->
      <Tabs.Content value="resignation" class="mt-4">
        <div class="rounded-xl border border-border/60 bg-card p-5 shadow-xs">
          <h3 class="mb-3 text-base font-semibold text-foreground">
            {$LL.admin.settings.resignation.title()}
          </h3>

          <div class="space-y-4">
            <div>
              <label for="memberResignRule" class="block text-sm font-medium text-foreground">
                {$LL.admin.settings.resignation.rule()}
              </label>
              <div class="mt-1.5">
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

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label for="memberResignDefaultReasonFi" class="block text-sm font-medium text-foreground">
                  {$LL.admin.settings.resignation.defaultReasonFi()}
                </label>
                <div class="mt-1.5">
                  <Input
                    type="text"
                    name="memberResignDefaultReasonFi"
                    id="memberResignDefaultReasonFi"
                    bind:value={values.memberResignDefaultReasonFi}
                    class="w-full"
                  />
                </div>
                {#if errors.memberResignDefaultReasonFi}<p class="mt-2 text-sm text-red-600">
                    {errors.memberResignDefaultReasonFi}
                  </p>{/if}
              </div>

              <div>
                <label for="memberResignDefaultReasonEn" class="block text-sm font-medium text-foreground">
                  {$LL.admin.settings.resignation.defaultReasonEn()}
                </label>
                <div class="mt-1.5">
                  <Input
                    type="text"
                    name="memberResignDefaultReasonEn"
                    id="memberResignDefaultReasonEn"
                    bind:value={values.memberResignDefaultReasonEn}
                    class="w-full"
                  />
                </div>
                {#if errors.memberResignDefaultReasonEn}<p class="mt-2 text-sm text-red-600">
                    {errors.memberResignDefaultReasonEn}
                  </p>{/if}
              </div>
            </div>
          </div>
        </div>
      </Tabs.Content>

      <!-- TAB 4: Privacy Policy -->
      <Tabs.Content value="privacyPolicy" class="mt-4">
        <div class="rounded-xl border border-border/60 bg-card p-5 shadow-xs">
          <h3 class="mb-3 text-base font-semibold text-foreground">
            {$LL.admin.settings.privacyPolicy.title()}
          </h3>

          <div class="space-y-4">
            <div>
              <label for="privacyPolicyFI" class="mb-2 block text-sm font-medium text-foreground">
                {$LL.admin.settings.privacyPolicy.fi()}
              </label>
              <MarkdownEditor id="privacyPolicyFI" bind:value={values.privacyPolicyFi} />
              <input type="hidden" name="privacyPolicyFi" bind:value={values.privacyPolicyFi} />
              {#if errors.privacyPolicyFi}
                <p class="mt-2 text-sm text-red-600">{errors.privacyPolicyFi}</p>
              {/if}
            </div>

            <div>
              <label for="privacyPolicyEN" class="mb-2 block text-sm font-medium text-foreground">
                {$LL.admin.settings.privacyPolicy.en()}
              </label>
              <MarkdownEditor id="privacyPolicyEN" bind:value={values.privacyPolicyEn} />
              <input type="hidden" name="privacyPolicyEn" bind:value={values.privacyPolicyEn} />
              {#if errors.privacyPolicyEn}
                <p class="mt-2 text-sm text-red-600">{errors.privacyPolicyEn}</p>
              {/if}
            </div>
          </div>
        </div>
      </Tabs.Content>
    </form>
  </Tabs.Root>
</main>
