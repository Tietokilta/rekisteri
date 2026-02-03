<script lang="ts">
  import type { PageProps } from "./$types";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import { Button } from "$lib/components/ui/button/index.js";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import MembersTable from "./members-table.svelte";
  import Upload from "@lucide/svelte/icons/upload";

  const { data }: PageProps = $props();
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
  <AdminPageHeader title={$LL.admin.members.title()} description={$LL.admin.members.description()}>
    {#snippet actions()}
      <Button href={route("/[locale=locale]/admin/members/import", { locale: $locale })}>
        <Upload />
        {$LL.admin.import.title()}
      </Button>
    {/snippet}
  </AdminPageHeader>
  <MembersTable data={data.members} membershipTypes={data.membershipTypes} years={data.years} />
</main>
