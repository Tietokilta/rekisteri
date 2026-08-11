<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";

  let { ref = $bindable(null), class: className, children, ...restProps }: TabsPrimitive.ListProps = $props();
</script>

<TabsPrimitive.List
  bind:ref
  class={cn(
    "inline-flex h-auto items-center justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</TabsPrimitive.List>
