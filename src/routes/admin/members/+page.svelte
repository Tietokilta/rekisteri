<script lang="ts">
	import type { PageProps } from "./$types";
	import { LL } from "$lib/i18n/i18n-svelte";

	const { data }: PageProps = $props();
</script>

<main class="my-4 flex flex-col items-center justify-center">
	<h1 class="font-mono text-lg">{$LL.admin.members.title()}</h1>
	<div class="min-w-3xl">
		<table class="w-full table-auto">
			<thead>
				<tr>
					<th>ID</th>
					<th>{$LL.admin.members.userId()}</th>
					<th>{$LL.user.firstNames()}</th>
					<th>{$LL.user.lastName()}</th>
					<th>{$LL.user.homeMunicipality()}</th>
					<th>{$LL.membership.type()}</th>
				</tr>
			</thead>
			<tbody>
				{#each data.members as member (member.id)}
					<tr class="h-12">
						<td class="overflow-x-auto border-t">{member.id}</td>
						<td class="overflow-x-auto border-t">{member.userId}</td>
						<td class="overflow-x-auto border-t">{member.firstNames ?? "-"}</td>
						<td class="overflow-x-auto border-t">{member.lastName ?? "-"}</td>
						<td class="overflow-x-auto border-t">{member.homeMunicipality ?? "-"}</td>
						<td class="overflow-x-auto border-t">{member.membershipType ?? "-"}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</main>
