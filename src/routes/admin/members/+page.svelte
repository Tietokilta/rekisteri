<script lang="ts">
	import type { PageProps } from "./$types";
	import * as m from "$lib/paraglide/messages.js";

	const { data }: PageProps = $props();
</script>

<main class="my-4 flex flex-col items-center justify-center">
	<h1 class="font-mono text-lg">{m.happy_away_guppy_aid()}</h1>
	<div class="min-w-3xl">
		<table class="w-full table-auto">
			<thead>
				<tr>
					<th>{m.quick_spare_mule_cry()}</th>
					<th>{m.fine_deft_impala_blend()}</th>
					<th>{m.grand_moving_capybara_trim()}</th>
					<th>{m.front_teal_beetle_earn()}</th>
					<th>{m.tough_dirty_turkey_drip()}</th>
					<th>{m.proud_seemly_gull_scoop()}</th>
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
