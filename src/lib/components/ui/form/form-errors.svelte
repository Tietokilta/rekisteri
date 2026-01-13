<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";
	import type { FormIssue } from "./form.svelte";

	let {
		errors,
		class: className,
		...restProps
	}: {
		errors: FormIssue[];
		class?: string;
	} & Omit<HTMLAttributes<HTMLParagraphElement>, "class"> = $props();
</script>

{#each errors as error, i (i)}
	<p class={cn("text-sm text-destructive", className)} {...restProps}>{error.message}</p>
{/each}
