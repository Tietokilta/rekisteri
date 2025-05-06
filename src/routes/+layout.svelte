<script lang="ts">
	import { localizeHref, getLocale, type Locale, deLocalizeHref } from "$lib/paraglide/runtime";
	import { page } from "$app/state";
	import "../app.css";
	import "@fontsource-variable/inter";
	import "@fontsource-variable/roboto-mono";
	import * as m from "$lib/paraglide/messages.js";
	import { ModeWatcher } from "mode-watcher";
	import RatasLogo from "$lib/icons/ratas-logo.svelte";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import { route } from "$lib/ROUTES";

	let { children } = $props();

	function languageHref(newLanguage: Locale) {
		const canonicalPath = deLocalizeHref(page.url.pathname);
		const localisedPath = localizeHref(canonicalPath, { locale: newLanguage });
		return localisedPath;
	}
</script>

<svelte:head>
	<title>
		{m.plain_long_maggot_build()}
	</title>
</svelte:head>

<ModeWatcher />
<div class="relative flex min-h-screen flex-col bg-background">
	<header
		class="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60"
	>
		<div class="container flex h-14 max-w-(--breakpoint-2xl) items-center justify-between">
			<a href={localizeHref(route("/"))} class="flex items-center gap-2">
				<RatasLogo class="h-12 w-12" />
				<span class="sr-only font-mono font-medium sm:not-sr-only sm:text-xl">{m.plain_long_maggot_build()}</span>
			</a>
			<ToggleGroup.Root type="single" value={getLocale()} data-sveltekit-reload>
				<ToggleGroup.Item value="fi">
					{#snippet child({ props })}
						<a {...props} href={languageHref("fi")}>fi</a>
					{/snippet}
				</ToggleGroup.Item>
				<ToggleGroup.Item value="en">
					{#snippet child({ props })}
						<a {...props} href={languageHref("en")}>en</a>
					{/snippet}
				</ToggleGroup.Item>
			</ToggleGroup.Root>
		</div>
	</header>
	{@render children()}
</div>
