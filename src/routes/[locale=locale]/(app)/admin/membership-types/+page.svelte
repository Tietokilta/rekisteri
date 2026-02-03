<script lang="ts">
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import type { PageProps } from "./$types";
  import { Button } from "$lib/components/ui/button";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as Item from "$lib/components/ui/item";
  import * as Empty from "$lib/components/ui/empty";
  import Plus from "@lucide/svelte/icons/plus";
  import Tag from "@lucide/svelte/icons/tag";
  import Package from "@lucide/svelte/icons/package";
  import CreateMembershipTypeForm from "./create-membership-type-form.svelte";
  import EditMembershipTypeForm from "./edit-membership-type-form.svelte";

  const { data }: PageProps = $props();

  // State for creating membership type
  let createSheetOpen = $state(false);

  // State for editing membership type
  let editingMembershipType = $state<(typeof data.membershipTypes)[number] | null>(null);
  let editSheetOpen = $state(false);

  function openEditSheet(membershipType: (typeof data.membershipTypes)[number]) {
    editingMembershipType = membershipType;
    editSheetOpen = true;
  }

  // Helper to get localized name
  function getTypeName(membershipType: (typeof data.membershipTypes)[number]): string {
    return $locale === "fi" ? membershipType.name.fi : membershipType.name.en;
  }

  // Helper to get localized description
  function getTypeDescription(membershipType: (typeof data.membershipTypes)[number]): string | null {
    if (!membershipType.description) return null;
    const desc = $locale === "fi" ? membershipType.description.fi : membershipType.description.en;
    return desc || null;
  }
</script>

<main class="container mx-auto max-w-350 px-4 py-6">
  <AdminPageHeader title={$LL.admin.membershipTypes.title()} description={$LL.admin.membershipTypes.description()}>
    {#snippet actions()}
      <Button onclick={() => (createSheetOpen = true)}>
        <Plus class="size-4" />
        {$LL.admin.membershipTypes.createNew()}
      </Button>
    {/snippet}
  </AdminPageHeader>

  {#if data.membershipTypes.length === 0}
    <!-- Empty state -->
    <Empty.Root class="border">
      <Empty.Header>
        <Empty.Media variant="icon">
          <Tag />
        </Empty.Media>
      </Empty.Header>
      <Empty.Title>{$LL.admin.membershipTypes.noTypes()}</Empty.Title>
      <Empty.Content>
        <Button onclick={() => (createSheetOpen = true)}>
          <Plus class="size-4" />
          {$LL.admin.membershipTypes.createNew()}
        </Button>
      </Empty.Content>
    </Empty.Root>
  {:else}
    <!-- Membership types list -->
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.membershipTypes as membershipType (membershipType.id)}
        <Item.Root variant="outline" size="sm">
          {#snippet child({ props })}
            <button
              type="button"
              {...props}
              class="{props.class} transition-colors hover:bg-accent/50"
              onclick={() => openEditSheet(membershipType)}
            >
              <Item.Media variant="icon">
                <Tag />
              </Item.Media>
              <Item.Content>
                <Item.Title>{getTypeName(membershipType)}</Item.Title>
                <Item.Description class="flex items-center gap-3">
                  <span class="flex items-center gap-1 font-mono text-xs">{membershipType.id}</span>
                  <span class="flex items-center gap-1">
                    <Package class="size-3.5" />
                    {membershipType.membershipCount}
                  </span>
                </Item.Description>
                {#if getTypeDescription(membershipType)}
                  <Item.Description class="line-clamp-2">
                    {getTypeDescription(membershipType)}
                  </Item.Description>
                {/if}
              </Item.Content>
            </button>
          {/snippet}
        </Item.Root>
      {/each}
    </div>
  {/if}
</main>

<!-- Create Membership Type Sheet -->
<Sheet.Root bind:open={createSheetOpen}>
  <Sheet.Content class="flex flex-col overflow-y-auto">
    <Sheet.Header>
      <Sheet.Title>{$LL.admin.membershipTypes.createNew()}</Sheet.Title>
      <Sheet.Description>{$LL.admin.membershipTypes.createDescription()}</Sheet.Description>
    </Sheet.Header>
    {#key createSheetOpen}
      {#if createSheetOpen}
        <CreateMembershipTypeForm onClose={() => (createSheetOpen = false)} />
      {/if}
    {/key}
  </Sheet.Content>
</Sheet.Root>

<!-- Edit Membership Type Sheet -->
<Sheet.Root bind:open={editSheetOpen}>
  <Sheet.Content class="flex flex-col overflow-y-auto">
    <Sheet.Header>
      <Sheet.Title>{$LL.admin.membershipTypes.editType()}</Sheet.Title>
      {#if editingMembershipType}
        <Sheet.Description class="font-mono">{editingMembershipType.id}</Sheet.Description>
      {/if}
    </Sheet.Header>
    {#if editingMembershipType}
      {#key editingMembershipType.id}
        <EditMembershipTypeForm membershipType={editingMembershipType} onClose={() => (editSheetOpen = false)} />
      {/key}
    {/if}
  </Sheet.Content>
</Sheet.Root>
