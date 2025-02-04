<script lang="ts">
	import { enhance } from "$app/forms";
	import Button from "$lib/components/ui/button/button.svelte";
	import { route } from "$lib/ROUTES";
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">Testimaksu</h1>

	<div class="flex w-full max-w-xs flex-col items-center gap-4 md:flex-row md:items-stretch">
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">Testimaksu</h2>
			<form use:enhance method="post" action={route("makePayment /admin/test-payment")}>
				<Button type="submit">Tee maksu</Button>
			</form>
		</div>
	</div>
</main>
