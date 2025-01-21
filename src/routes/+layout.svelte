<script lang="ts">
	import type { AvailableLanguageTag } from "$lib/paraglide/runtime";
	import { i18n } from "$lib/i18n";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { ParaglideJS } from "@inlang/paraglide-sveltekit";
	import "../app.css";
	import * as m from "$lib/paraglide/messages.js";
	let { children } = $props();

	function switchToLanguage(newLanguage: AvailableLanguageTag) {
		const canonicalPath = i18n.route(page.url.pathname);
		const localisedPath = i18n.resolveRoute(canonicalPath, newLanguage);
		goto(localisedPath);
	}
</script>

<ParaglideJS {i18n}>
	<div>
		<header>
			<h1>{m.plain_long_maggot_build()}</h1>
			<div>
				<button onclick={() => switchToLanguage("fi")}>fi</button>
				<button onclick={() => switchToLanguage("en")}>en</button>
			</div>
		</header>
		{@render children()}
	</div>
</ParaglideJS>
