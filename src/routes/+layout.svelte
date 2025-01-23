<script lang="ts">
	import { languageTag, type AvailableLanguageTag } from "$lib/paraglide/runtime";
	import { i18n } from "$lib/i18n";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { ParaglideJS } from "@inlang/paraglide-sveltekit";
	import "../app.css";
	import "@fontsource-variable/inter";
	import "@fontsource-variable/roboto-mono";
	import * as m from "$lib/paraglide/messages.js";
	import { ModeWatcher } from "mode-watcher";
	import RatasLogo from "$lib/icons/ratas-logo.svelte";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import { route } from "$lib/ROUTES";

	let { children } = $props();

	function switchToLanguage(newLanguage: AvailableLanguageTag) {
		const canonicalPath = i18n.route(page.url.pathname);
		const localisedPath = i18n.resolveRoute(canonicalPath, newLanguage);
		goto(localisedPath);
	}
</script>

<svelte:head>
	<title>
		{m.plain_long_maggot_build()}
	</title>
</svelte:head>

<ModeWatcher />
<ParaglideJS {i18n}>
	<div class="relative flex min-h-screen flex-col bg-background">
		<header
			class="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
		>
			<div class="container flex h-14 max-w-screen-2xl items-center justify-between">
				<a href={i18n.resolveRoute(route("/"))} class="flex items-center gap-2">
					<RatasLogo class="h-12 w-12" />
					<span class="sr-only font-mono font-medium sm:not-sr-only sm:text-xl">{m.plain_long_maggot_build()}</span>
				</a>
				<ToggleGroup.Root type="single" value={languageTag()}>
					<ToggleGroup.Item value="fi" onclick={() => switchToLanguage("fi")}>fi</ToggleGroup.Item>
					<ToggleGroup.Item value="en" onclick={() => switchToLanguage("en")}>en</ToggleGroup.Item>
				</ToggleGroup.Root>
			</div>
		</header>
		{@render children()}
	</div>
</ParaglideJS>
