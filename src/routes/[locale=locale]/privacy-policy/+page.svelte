<script lang="ts">
	import { LL } from "$lib/i18n/i18n-svelte";
</script>

<svelte:head>
	<title>{$LL.documents.memberRegistryPrivacy.title()} - {$LL.app.title()}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
	<div class="mx-auto prose dark:prose-invert">
		<h1>{$LL.documents.memberRegistryPrivacy.title()}</h1>

		<!-- eslint-disable svelte/no-at-html-tags -->
		<p class="text-muted-foreground">
			{@html $LL.documents.memberRegistryPrivacy.intro()}
		</p>
		<p class="text-sm text-muted-foreground">
			{$LL.documents.memberRegistryPrivacy.createdDate()}<br />
			{$LL.documents.memberRegistryPrivacy.lastUpdated()}
		</p>

		<hr />

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section1Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section1Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section2Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section2Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section3Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section3Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section4Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section4Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section5Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section5Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section6Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section6Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section7Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section7Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section8Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section8Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section9Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section9Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section10Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section10Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section11Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section11Content()}
		</section>

		<section>
			<h2>{$LL.documents.memberRegistryPrivacy.section12Title()}</h2>
			{@html $LL.documents.memberRegistryPrivacy.section12Content()}
		</section>
		<!-- eslint-enable svelte/no-at-html-tags -->
	</div>
</div>
