<script lang="ts">
	import { Label } from "$lib/components/ui/label/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { LL } from "$lib/i18n/i18n-svelte";
	import * as InputOTP from "$lib/components/ui/input-otp/index.js";
	import type { PageData } from "./$types";
	import { verifyCode, resendEmail, cancelVerification } from "./data.remote";
	import { verifyCodeSchema } from "./schema";

	let { data }: { data: PageData } = $props();

	let verifyFormEl: HTMLFormElement;
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">{$LL.secondaryEmail.verifyTitle()}</h1>
	<p class="max-w-xs">{$LL.secondaryEmail.verifyDescription({ email: data.email })}</p>
	<div class="flex w-full max-w-xs flex-col gap-4">
		<form bind:this={verifyFormEl} {...verifyCode.preflight(verifyCodeSchema)} class="contents">
			<div>
				<Label for="form-verify.code">{$LL.secondaryEmail.code()}</Label>
				<InputOTP.Root
					maxlength={8}
					name={verifyCode.fields.code.as("text").name}
					required
					class="capitalize"
					onComplete={() => verifyFormEl.requestSubmit()}
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
			{#each verifyCode.fields.allIssues() as issue, i (i)}
				<p class="text-red-500">{issue.message}</p>
			{/each}
			<Button type="submit" data-testid="verify-otp">{$LL.auth.verify()}</Button>
		</form>
		<form {...resendEmail} class="contents">
			<Button type="submit" variant="outline">{$LL.auth.resendCode()}</Button>
			{#if resendEmail.result?.message}
				<p>{resendEmail.result.message}</p>
			{/if}
		</form>
		<form {...cancelVerification} class="contents">
			<Button type="submit" variant="outline">{$LL.auth.passkey.cancel()}</Button>
		</form>
	</div>
</main>
