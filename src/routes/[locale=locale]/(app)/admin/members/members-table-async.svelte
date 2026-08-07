<script lang="ts">
  import MembersTable from "./members-table.svelte";
  import type { MembershipType } from "$lib/server/db/schema";

  type Props = {
    membersPromise: Promise<Parameters<typeof MembersTable>[1]["data"]>;
    membershipTypes: MembershipType[];
    availableMemberships: Parameters<typeof MembersTable>[1]["availableMemberships"];
    years: number[];
    canWrite: boolean;
  };

  let { membersPromise, membershipTypes, availableMemberships, years, canWrite }: Props = $props();

  const members = $derived(await membersPromise);
</script>

<MembersTable data={members} {membershipTypes} {availableMemberships} {years} {canWrite} />
