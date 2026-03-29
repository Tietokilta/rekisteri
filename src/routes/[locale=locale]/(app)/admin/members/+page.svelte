<script lang="ts">
  import type { PageProps } from "./$types";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import { Button } from "$lib/components/ui/button/index.js";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import MembersTableAsync from "./members-table-async.svelte";
  import MembersTableSkeleton from "./members-table-skeleton.svelte";
  import CreateMemberForm from "./create-member-form.svelte";
  import * as Sheet from "$lib/components/ui/sheet";
  import Upload from "@lucide/svelte/icons/upload";
  import Plus from "@lucide/svelte/icons/plus";

  const { data }: PageProps = $props();

  let createSheetOpen = $state(false);
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6" data-testid="admin-members-page">
  <AdminPageHeader title={$LL.admin.members.title()} description={$LL.admin.members.description()}>
    {#snippet actions()}
      {#if data.canWrite}
        <Button onclick={() => (createSheetOpen = true)} data-testid="add-member-button">
          <Plus class="size-4" />
          {$LL.admin.members.addMember()}
        </Button>
        <Button
          href={route("/[locale=locale]/admin/members/import", { locale: $locale })}
          variant="outline"
          data-testid="import-members-button"
        >
          <Upload />
          {$LL.admin.import.title()}
        </Button>
      {/if}
    {/snippet}
  </AdminPageHeader>

  <svelte:boundary>
    <MembersTableAsync
      membersPromise={data.members}
      membershipTypes={data.membershipTypes}
      years={data.years}
      canWrite={data.canWrite}
    />

    {#snippet pending()}
      <MembersTableSkeleton />
    {/snippet}

    {#snippet failed(error: unknown)}
      <div class="rounded-md border border-destructive bg-destructive/10 p-6 text-center">
        <p class="font-medium text-destructive">{$LL.error.genericError()}</p>
        <p class="mt-1 text-sm text-destructive/80">{error instanceof Error ? error.message : ""}</p>
      </div>
    {/snippet}
  </svelte:boundary>
</main>

{#if data.canWrite}
  <!-- Create Member Sheet -->
  <Sheet.Root bind:open={createSheetOpen}>
    <Sheet.Content class="flex flex-col overflow-y-auto">
      <Sheet.Header>
        <Sheet.Title>{$LL.admin.members.addMember()}</Sheet.Title>
      </Sheet.Header>
      {#key createSheetOpen}
        {#if createSheetOpen}
          <CreateMemberForm
            availableMemberships={data.availableMemberships}
            onClose={() => (createSheetOpen = false)}
          />
        {/if}
      {/key}
    </Sheet.Content>
  </Sheet.Root>
{/if}
