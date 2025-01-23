<script lang="ts">
	import { enhance } from "$app/forms";
	import { Button } from "$lib/components/ui/button";
	import type { PageServerData } from "./$types";
	import * as m from "$lib/paraglide/messages.js";

	let { data }: { data: PageServerData } = $props();
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<div class="flex max-w-xs flex-col gap-2">
		<h1 class="font-mono text-lg">{m.such_wise_mongoose_win({ email: data.user.email })}</h1>
		<p>Your user ID is {data.user.id}.</p>
		<form method="post" action="?/logout" use:enhance class="contents">
			<Button type="submit">{m.brief_early_scallop_bless()}</Button>
		</form>
	</div>
</main>
