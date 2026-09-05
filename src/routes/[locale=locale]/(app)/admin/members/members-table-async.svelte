<script lang="ts">
  import MembersTable from "./members-table.svelte";
  import type { MembershipType } from "$lib/server/db/schema";

  type Props = {
    membersPromise: Promise<Parameters<typeof MembersTable>[1]["data"]>;
    membershipTypes: MembershipType[];
    availableFeePeriods: Parameters<typeof MembersTable>[1]["availableFeePeriods"];
    years: number[];
    canWrite: boolean;
  };

  let { membersPromise, membershipTypes, availableFeePeriods, years, canWrite }: Props = $props();

  const members = $derived(await membersPromise);
</script>

<MembersTable data={members} {membershipTypes} {availableFeePeriods} {years} {canWrite} />
