<script lang="ts">
  import { LL } from "$lib/i18n/i18n-svelte";
  import { Input } from "$lib/components/ui/input";
  import * as Tabs from "$lib/components/ui/tabs";

  let {
    values = $bindable(),
    errors,
  }: {
    values: Record<string, string>;
    errors: Record<string, string | undefined>;
  } = $props();
</script>

<Tabs.Content value="organization" class="mt-4 space-y-4">
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
