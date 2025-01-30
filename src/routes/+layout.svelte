<script lang="ts">
	import { getLocale, localizePath, setLocale } from "$lib/paraglide/runtime";
	import { ParaglideSveltekitProvider } from "$lib/paraglide/adapter";
	import "../app.css";
	import "@fontsource-variable/inter";
	import "@fontsource-variable/roboto-mono";
	import * as m from "$lib/paraglide/messages.js";
	import { ModeWatcher } from "mode-watcher";
	import RatasLogo from "$lib/icons/ratas-logo.svelte";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import { route } from "$lib/ROUTES";

	let { children } = $props();
</script>

<svelte:head>
	<title>
		{m.plain_long_maggot_build()}
	</title>
</svelte:head>

<ModeWatcher />
<ParaglideSveltekitProvider>
	<div class="relative flex min-h-screen flex-col bg-background">
		<header
			class="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60"
		>
			<div class="container flex h-14 max-w-(--breakpoint-2xl) items-center justify-between">
				<a href={localizePath(route("/"))} class="flex items-center gap-2">
					<RatasLogo class="h-12 w-12" />
					<span class="sr-only font-mono font-medium sm:not-sr-only sm:text-xl">{m.plain_long_maggot_build()}</span>
				</a>
				<ToggleGroup.Root type="single" value={getLocale()}>
					<ToggleGroup.Item value="fi" onclick={() => setLocale("fi")}>fi</ToggleGroup.Item>
					<ToggleGroup.Item value="en" onclick={() => setLocale("en")}>en</ToggleGroup.Item>
				</ToggleGroup.Root>
			</div>
		</header>
		{@render children()}
	</div>
</ParaglideSveltekitProvider>
