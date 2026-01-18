<script lang="ts">
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	// svelte-check doesn't recognize ambient module declarations for .svx files
	// @ts-expect-error - see app.d.ts for module declaration
	import FiContent, { metadata as fiMetadata } from "./fi.svx";
	// @ts-expect-error - see app.d.ts for module declaration
	import EnContent, { metadata as enMetadata } from "./en.svx";

	const metadata = { fi: fiMetadata, en: enMetadata } as const;
</script>

<svelte:head>
	<title>{metadata[$locale].title} - {$LL.app.title()}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
	<div class="mx-auto prose dark:prose-invert">
		{#if $locale === "fi"}
			<FiContent />
		{:else}
			<EnContent />
		{/if}
	</div>
</div>
