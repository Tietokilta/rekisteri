<script lang="ts">
	import { enhance } from "$app/forms";
	import type { ActionData } from "./$types";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as m from "$lib/paraglide/messages.js";

	let { form }: { form: ActionData } = $props();
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">{m.round_tense_spider_lock()}</h1>
	<form method="post" use:enhance class="flex w-full max-w-xs flex-col gap-4">
		<p>
			<Label for="email">{m.dark_weak_vulture_bless()}</Label>
			<Input id="email" name="email" type="email" placeholder="example@tietokilta.fi" required />
		</p>
		<Button type="submit">{m.round_tense_spider_lock()}</Button>
	</form>
	<p style="color: red">{form?.message ?? ""}</p>
</main>
