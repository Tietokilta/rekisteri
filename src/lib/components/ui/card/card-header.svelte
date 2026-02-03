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
  data-slot="card-header"
  class={cn(
    "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:gap-3 has-data-[slot=card-action]:@sm/card-header:grid-cols-[1fr_auto] has-data-[slot=card-action]:@sm/card-header:gap-1.5 [.border-b]:pb-6",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</div>
