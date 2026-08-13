<script lang="ts">
  import type { PageData } from "./$types";
  import { LL } from "$lib/i18n/i18n-svelte";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Tabs from "$lib/components/ui/tabs";
  import { toast } from "svelte-sonner";

  import { updateCustomization } from "./data.remote";
  import { updateCustomizationSchema } from "./schema";

  import Palette from "@lucide/svelte/icons/palette";
  import Building2 from "@lucide/svelte/icons/building-2";
  import UserX from "@lucide/svelte/icons/user-x";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";

  import BrandingTab from "./tabs/branding-tab.svelte";
  import OrganizationTab from "./tabs/organization-tab.svelte";
  import ResignationTab from "./tabs/resignation-tab.svelte";
  import PrivacyTab from "./tabs/privacy-tab.svelte";

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
    <Tabs.List class="grid h-auto w-full grid-cols-2 items-center gap-1 rounded-xl bg-muted/60 p-1.5 md:grid-cols-5">
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
      class="contents"
    >
      {#if removeImages.logo}<input type="hidden" name="removeLogo" value="true" />{/if}
      {#if removeImages.logoDark}<input type="hidden" name="removeLogoDark" value="true" />{/if}
      {#if removeImages.favicon}<input type="hidden" name="removeFavicon" value="true" />{/if}
      {#if removeImages.faviconDark}<input type="hidden" name="removeFaviconDark" value="true" />{/if}

      <!-- TAB 1: Branding & Appearance -->
      <BrandingTab
        bind:values
        bind:useCustomAccentColor
        bind:accentColorInputValue
        bind:removeImages
        {errors}
        {data}
        {getImageUrl}
        {toggleRemove}
        {fileInputClass}
      />

      <!-- TAB 2: Organization Details -->
      <OrganizationTab bind:values {errors} />

      <!-- TAB 3: Resignation & Rules -->
      <ResignationTab bind:values {errors} />

      <!-- TAB 4: Privacy Policy -->
      <PrivacyTab bind:values {errors} />
    </form>
  </Tabs.Root>
</main>
