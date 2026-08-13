<script lang="ts">
  import { LL } from "$lib/i18n/i18n-svelte";
  import MarkdownEditor from "$lib/components/markdown-editor.svelte";
  import * as Tabs from "$lib/components/ui/tabs";

  let {
    values = $bindable(),
    errors,
  }: {
    values: Record<string, string>;
    errors: Record<string, string | undefined>;
  } = $props();
</script>

<Tabs.Content value="privacyPolicy" class="mt-4 space-y-4">
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
