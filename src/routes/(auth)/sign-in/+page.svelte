<script lang="ts">
	import { enhance } from "$app/forms";
	import type { ActionData } from "./$types";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { LL } from "$lib/i18n/i18n-svelte";

	let { form }: { form: ActionData } = $props();
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">{$LL.auth.signIn()}</h1>
	<form method="post" use:enhance class="flex w-full max-w-xs flex-col gap-4">
		<p>
			<Label for="email">{$LL.auth.email()}</Label>
			<Input
				id="email"
				name="email"
				type="email"
				autocomplete="email"
				autocapitalize="none"
				autocorrect="off"
				placeholder="example@tietokilta.fi"
				required
			/>
		</p>
		<Button type="submit">{$LL.auth.signIn()}</Button>
	</form>
	<p style="color: red">{form?.message ?? ""}</p>
</main>
