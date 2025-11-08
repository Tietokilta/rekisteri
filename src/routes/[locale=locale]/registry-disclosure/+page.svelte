<script lang="ts">
	import { LL } from "$lib/i18n/i18n-svelte";
</script>

<svelte:head>
	<title>{$LL.documents.registryDisclosure.title()} - {$LL.app.title()}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
	<div class="mx-auto prose dark:prose-invert">
		<h1>{$LL.documents.registryDisclosure.title()}</h1>

		<!-- eslint-disable svelte/no-at-html-tags -->
		<section>
			<h2>{$LL.documents.registryDisclosure.section1Title()}</h2>
			<p>{@html $LL.documents.registryDisclosure.section1Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.registryDisclosure.section2Title()}</h2>
			<p>{@html $LL.documents.registryDisclosure.section2Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.registryDisclosure.section3Title()}</h2>
			<p>{@html $LL.documents.registryDisclosure.section3Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.registryDisclosure.section4Title()}</h2>
			<p>{@html $LL.documents.registryDisclosure.section4Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.registryDisclosure.section5Title()}</h2>
			<p>{@html $LL.documents.registryDisclosure.section5Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.registryDisclosure.section6Title()}</h2>
			<p>{@html $LL.documents.registryDisclosure.section6Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.registryDisclosure.section7Title()}</h2>
			<p>{@html $LL.documents.registryDisclosure.section7Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.registryDisclosure.section8Title()}</h2>
			<p>{@html $LL.documents.registryDisclosure.section8Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.registryDisclosure.section9Title()}</h2>
			<p>{@html $LL.documents.registryDisclosure.section9Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.registryDisclosure.section10Title()}</h2>
			<p>{@html $LL.documents.registryDisclosure.section10Content()}</p>
		</section>
		<!-- eslint-enable svelte/no-at-html-tags -->

		<p class="mt-8 text-sm text-gray-600 dark:text-gray-400">
			{$LL.documents.registryDisclosure.lastUpdated()}
		</p>
	</div>
</div>
