<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card-action"
	class={cn(
		"self-start @sm/card-header:col-start-2 @sm/card-header:row-span-2 @sm/card-header:row-start-1 @sm/card-header:justify-self-end",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
