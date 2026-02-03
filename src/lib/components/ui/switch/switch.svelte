<script lang="ts">
  import { Switch as SwitchPrimitive } from "bits-ui";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

  // Extend the type to accept "checkbox" for remote form compatibility
  type SwitchProps = Omit<WithoutChildrenOrChild<SwitchPrimitive.RootProps>, "type"> & {
    type?: WithoutChildrenOrChild<SwitchPrimitive.RootProps>["type"] | "checkbox";
  };

  let {
    ref = $bindable(null),
    class: className,
    checked = $bindable(false),
    type,
    ...restProps
  }: SwitchProps = $props();
</script>

<SwitchPrimitive.Root
  bind:ref
  bind:checked
  data-slot="switch"
  class={cn(
    "peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
    className,
  )}
  type={type === "checkbox" ? undefined : type}
  {...restProps}
>
  <SwitchPrimitive.Thumb
    data-slot="switch-thumb"
    class={cn(
      "pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground",
    )}
  />
</SwitchPrimitive.Root>
