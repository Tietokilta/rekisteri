<script lang="ts">
	import { page } from "$app/state";
	import { LL } from "$lib/i18n/i18n-svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Label } from "$lib/components/ui/label/index.js";

	interface Props {
		errorCode?: string | number;
	}

	let { errorCode }: Props = $props();

	let isOpen = $state(false);
	let message = $state("");
	let isSubmitting = $state(false);
	let submitted = $state(false);
	let errorMessage = $state("");

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!message.trim()) return;

		isSubmitting = true;
		errorMessage = "";

		try {
			const response = await fetch("/api/feedback", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					message: message.trim(),
					pageUrl: page.url.href,
					errorCode: errorCode?.toString(),
					userAgent: navigator.userAgent,
				}),
			});

			if (!response.ok) {
				errorMessage = response.status === 429 ? $LL.feedback.rateLimited() : $LL.feedback.submitError();
				return;
			}

			submitted = true;
			message = "";
		} catch {
			errorMessage = $LL.feedback.submitError();
		} finally {
			isSubmitting = false;
		}
	}

	function reset() {
		submitted = false;
		errorMessage = "";
		message = "";
	}
</script>

<div class="mt-6 w-full">
	<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={() => (isOpen = !isOpen)}>
		{isOpen ? $LL.feedback.close() : $LL.feedback.reportIssue()}
	</Button>

	{#if isOpen}
		<div class="mt-4">
			{#if submitted}
				<div class="rounded-lg border bg-muted/50 p-4 text-center">
					<p class="text-sm text-muted-foreground">{$LL.feedback.thankYou()}</p>
					<Button variant="ghost" size="sm" class="mt-2" onclick={reset}>
						{$LL.feedback.sendAnother()}
					</Button>
				</div>
			{:else}
				<form onsubmit={handleSubmit} class="space-y-3">
					<div class="space-y-2">
						<Label for="feedback-message">{$LL.feedback.message()}</Label>
						<textarea
							id="feedback-message"
							bind:value={message}
							placeholder={$LL.feedback.placeholder()}
							required
							maxlength="2000"
							rows="3"
							class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						></textarea>
					</div>

					{#if errorMessage}
						<p class="text-sm text-destructive">{errorMessage}</p>
					{/if}

					<div class="flex justify-end gap-2">
						<Button type="button" variant="ghost" size="sm" onclick={() => (isOpen = false)}>
							{$LL.common.cancel()}
						</Button>
						<Button type="submit" size="sm" disabled={isSubmitting || !message.trim()}>
							{isSubmitting ? $LL.feedback.sending() : $LL.feedback.send()}
						</Button>
					</div>
				</form>
			{/if}
		</div>
	{/if}
</div>
