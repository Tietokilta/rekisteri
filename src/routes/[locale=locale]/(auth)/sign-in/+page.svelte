<script lang="ts">
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { LL } from "$lib/i18n/i18n-svelte";
	import { signIn, signInSchema } from "./data.remote";
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">{$LL.auth.signIn()}</h1>
	<form {...signIn.preflight(signInSchema)} class="flex w-full max-w-xs flex-col gap-4">
		<p>
			<Label for="form-signIn.email">{$LL.auth.email()}</Label>
			<Input
				{...signIn.fields.email.as("email")}
				autocomplete="email"
				autocapitalize="none"
				autocorrect="off"
				placeholder="example@tietokilta.fi"
				required
			/>
		</p>
		<Button type="submit">{$LL.auth.signIn()}</Button>
	</form>
	{#each signIn.fields.allIssues() as issue, i (i)}
		<p style="color: red">{issue.message}</p>
	{/each}
</main>
