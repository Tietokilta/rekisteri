<script lang="ts">
	import { LL } from "$lib/i18n/i18n-svelte";
</script>

<svelte:head>
	<title>{$LL.documents.privacyPolicy.title()} - {$LL.app.title()}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
	<div class="mx-auto prose dark:prose-invert">
		<h1>{$LL.documents.privacyPolicy.title()}</h1>

		<!-- eslint-disable svelte/no-at-html-tags -->
		<section>
			<h2>{$LL.documents.privacyPolicy.section1Title()}</h2>
			<p>{@html $LL.documents.privacyPolicy.section1Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.privacyPolicy.section2Title()}</h2>
			<p>{@html $LL.documents.privacyPolicy.section2Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.privacyPolicy.section3Title()}</h2>
			<p>{@html $LL.documents.privacyPolicy.section3Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.privacyPolicy.section4Title()}</h2>
			<p>{@html $LL.documents.privacyPolicy.section4Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.privacyPolicy.section5Title()}</h2>
			<p>{@html $LL.documents.privacyPolicy.section5Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.privacyPolicy.section6Title()}</h2>
			<p>{@html $LL.documents.privacyPolicy.section6Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.privacyPolicy.section7Title()}</h2>
			<p>{@html $LL.documents.privacyPolicy.section7Content()}</p>
		</section>

		<section>
			<h2>{$LL.documents.privacyPolicy.section8Title()}</h2>
			<p>{@html $LL.documents.privacyPolicy.section8Content()}</p>
		</section>
		<!-- eslint-enable svelte/no-at-html-tags -->

		<p class="mt-8 text-sm text-gray-600 dark:text-gray-400">
			{$LL.documents.privacyPolicy.lastUpdated()}
		</p>
	</div>
</div>
