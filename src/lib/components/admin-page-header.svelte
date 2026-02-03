<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    description,
    actions,
  }: {
    title: string;
    description?: string;
    actions?: Snippet;
  } = $props();
</script>

<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
  <div>
    <h1 class="text-2xl font-bold tracking-tight">{title}</h1>
    {#if description}
      <p class="text-muted-foreground">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex gap-2">
      {@render actions()}
    </div>
  {/if}
</div>
