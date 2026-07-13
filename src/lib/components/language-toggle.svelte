<script lang="ts">
  import { page } from "$app/state";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { locale } from "$lib/i18n/i18n-svelte";
  import { stripLocaleFromPathname, type Locale } from "$lib/i18n/routing";

  interface Props {
    class?: string;
    itemClass?: string;
    lowercase?: boolean;
  }

  let { class: className, itemClass, lowercase = false }: Props = $props();

  function languageHref(newLanguage: Locale) {
    const canonicalPath = stripLocaleFromPathname(page.url.pathname);
    return `/${newLanguage}${canonicalPath}`;
  }
</script>

<ToggleGroup.Root type="single" value={$locale} class={className} data-sveltekit-reload>
  <ToggleGroup.Item value="fi" class={itemClass}>
    {#snippet child({ props })}
      <a {...props} href={languageHref("fi")}>{lowercase ? "fi" : "FI"}</a>
    {/snippet}
  </ToggleGroup.Item>
  <ToggleGroup.Item value="en" class={itemClass}>
    {#snippet child({ props })}
      <a {...props} href={languageHref("en")}>{lowercase ? "en" : "EN"}</a>
    {/snippet}
  </ToggleGroup.Item>
</ToggleGroup.Root>
