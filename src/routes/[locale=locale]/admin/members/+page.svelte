<script lang="ts">
	import type { PageProps } from "./$types";
	import { LL } from "$lib/i18n/i18n-svelte";
	import MembersTable from "./members-table.svelte";

	const { data }: PageProps = $props();
</script>

<main class="container mx-auto py-6">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">{$LL.admin.members.title()}</h1>
		<p class="text-muted-foreground">{$LL.admin.members.description()}</p>
	</div>
	<MembersTable data={data.members} membershipTypes={data.membershipTypes} years={data.years} />
</main>
