<script lang="ts">
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { localizePathname, stripLocaleFromPathname, type Locale } from "$lib/i18n/routing";
	import { page } from "$app/state";
	import "../app.css";
	import "@fontsource-variable/inter";
	import "@fontsource-variable/roboto-mono";
	import { ModeWatcher } from "mode-watcher";
	import RatasLogo from "$lib/icons/ratas-logo.svelte";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import { route } from "$lib/ROUTES";

	let { children } = $props();

	function languageHref(newLanguage: Locale) {
		const canonicalPath = stripLocaleFromPathname(page.url.pathname);
		return localizePathname(canonicalPath, newLanguage);
	}
</script>

<svelte:head>
	<title>
		{$LL.app.title()}
	</title>
</svelte:head>

<ModeWatcher disableHeadScriptInjection />
<div class="relative flex min-h-screen flex-col bg-background">
	<header
		class="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60"
	>
		<div class="mx-auto w-full max-w-[1400px]">
			<div class="container mx-auto flex h-14 items-center justify-between gap-2 px-4 md:gap-4">
				<a href={localizePathname(route("/"), $locale)} class="flex items-center gap-2">
					<RatasLogo class="h-12 w-12" />
					<span class="sr-only font-mono font-medium sm:not-sr-only sm:text-xl">{$LL.app.title()}</span>
				</a>
				<ToggleGroup.Root type="single" value={$locale} data-sveltekit-reload>
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
		</div>
	</header>
	{@render children()}
</div>
