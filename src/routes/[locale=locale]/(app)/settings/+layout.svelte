<script lang="ts">
	let { children }: { children: import("svelte").Snippet } = $props();
</script>

<!-- Settings pages render directly - navigation is already in the sidebar -->
<div class="container mx-auto max-w-2xl px-4 py-8">
	{@render children()}
</div>
