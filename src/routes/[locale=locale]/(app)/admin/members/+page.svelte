<script lang="ts">
  import type { PageProps } from "./$types";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import { Button } from "$lib/components/ui/button/index.js";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import MembersTable from "./members-table.svelte";
  import CreateMemberForm from "./create-member-form.svelte";
  import * as Sheet from "$lib/components/ui/sheet";
  import Upload from "@lucide/svelte/icons/upload";
  import Plus from "@lucide/svelte/icons/plus";

  const { data }: PageProps = $props();

  let createSheetOpen = $state(false);
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
  <AdminPageHeader title={$LL.admin.members.title()} description={$LL.admin.members.description()}>
    {#snippet actions()}
      <Button onclick={() => (createSheetOpen = true)}>
        <Plus class="size-4" />
        {$LL.admin.members.addMember()}
      </Button>
      <Button href={route("/[locale=locale]/admin/members/import", { locale: $locale })} variant="outline">
        <Upload />
        {$LL.admin.import.title()}
      </Button>
    {/snippet}
  </AdminPageHeader>
  <MembersTable data={data.members} membershipTypes={data.membershipTypes} years={data.years} />
</main>

<!-- Create Member Sheet -->
<Sheet.Root bind:open={createSheetOpen}>
  <Sheet.Content class="flex flex-col overflow-y-auto">
    <Sheet.Header>
      <Sheet.Title>{$LL.admin.members.addMember()}</Sheet.Title>
    </Sheet.Header>
    {#key createSheetOpen}
      {#if createSheetOpen}
        <CreateMemberForm availableMemberships={data.availableMemberships} onClose={() => (createSheetOpen = false)} />
      {/if}
    {/key}
  </Sheet.Content>
</Sheet.Root>
