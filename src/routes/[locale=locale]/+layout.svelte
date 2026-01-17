<script lang="ts">
	import { LL } from "$lib/i18n/i18n-svelte";
	import "../../app.css";
	import "@fontsource-variable/inter";
	import "@fontsource-variable/roboto-mono";
	import { ModeWatcher } from "mode-watcher";
	import { Toaster } from "$lib/components/ui/sonner";

	let { children }: { children: import("svelte").Snippet } = $props();
</script>

<svelte:head>
	<title>
		{$LL.app.title()}
	</title>
</svelte:head>

<ModeWatcher disableHeadScriptInjection />
<Toaster position="top-center" />
{@render children()}
