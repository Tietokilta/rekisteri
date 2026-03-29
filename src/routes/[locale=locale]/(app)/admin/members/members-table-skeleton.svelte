<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
</script>

<div class="space-y-4" data-testid="members-table-loading">
  <!-- Filter bar skeleton -->
  <div class="flex flex-wrap items-center gap-3">
    <Skeleton class="h-9 w-64" />
    <Skeleton class="h-9 w-32" />
    <Skeleton class="h-9 w-32" />
    <Skeleton class="h-9 w-32" />
  </div>
  <!-- Table skeleton -->
  <div class="rounded-md border">
    <div class="border-b px-4 py-3">
      <div class="flex gap-4">
        <Skeleton class="h-4 w-8" />
        <Skeleton class="h-4 w-32" />
        <Skeleton class="h-4 w-48" />
        <Skeleton class="h-4 w-32" />
        <Skeleton class="h-4 w-24" />
        <Skeleton class="h-4 w-24" />
      </div>
    </div>
    {#each { length: 10 } as _, i (i)}
      <div class="border-b px-4 py-3">
        <div class="flex gap-4">
          <Skeleton class="h-4 w-8" />
          <Skeleton class="h-4 w-32" />
          <Skeleton class="h-4 w-48" />
          <Skeleton class="h-4 w-32" />
          <Skeleton class="h-4 w-24" />
          <Skeleton class="h-4 w-24" />
        </div>
      </div>
    {/each}
  </div>
  <!-- Pagination skeleton -->
  <div class="flex items-center justify-between">
    <Skeleton class="h-4 w-48" />
    <div class="flex gap-2">
      <Skeleton class="h-9 w-20" />
      <Skeleton class="h-9 w-20" />
    </div>
  </div>
</div>
