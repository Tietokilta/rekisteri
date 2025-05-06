<script lang="ts">
	import { enhance } from "$app/forms";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as m from "$lib/paraglide/messages.js";
	import * as InputOTP from "$lib/components/ui/input-otp/index.js";

	import type { ActionData, PageData } from "./$types";

	export let data: PageData;
	export let form: ActionData;

	let verifyForm: HTMLFormElement;
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">{m.round_tense_spider_lock()}</h1>
	<p class="max-w-xs">{m.raw_witty_alligator_strive({ email: data.email })}</p>
	<div class="flex w-full max-w-xs flex-col gap-4">
		<form bind:this={verifyForm} method="post" use:enhance action="?/verify" class="contents">
			<div>
				<Label for="form-verify.code">{m.day_stale_porpoise_borrow()}</Label>
				<InputOTP.Root
					maxlength={8}
					name="code"
					required
					class="capitalize"
					onComplete={() => verifyForm.requestSubmit()}
				>
					{#snippet children({ cells })}
						<InputOTP.Group>
							{#each cells as cell, i (i)}
								<InputOTP.Slot {cell} />
							{/each}
						</InputOTP.Group>
					{/snippet}
				</InputOTP.Root>
			</div>
			{#if form?.verify?.message}
				<p class="text-red-500">{form.verify.message}</p>
			{/if}
			<Button type="submit">{m.same_nimble_guppy_find()}</Button>
		</form>
		<form method="post" use:enhance action="?/resend" class="contents">
			<Button type="submit" variant="outline">{m.large_these_horse_twist()}</Button>
			{#if form?.resend?.message}
				<p>{form.resend.message}</p>
			{/if}
		</form>
	</div>
</main>
