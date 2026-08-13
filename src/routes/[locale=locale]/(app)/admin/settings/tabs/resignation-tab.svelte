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

<Tabs.Content value="resignation" class="mt-4 space-y-4">
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
