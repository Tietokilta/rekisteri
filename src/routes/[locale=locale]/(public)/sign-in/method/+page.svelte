<script lang="ts">
	import { goto } from "$app/navigation";
	import type { PageData } from "./$types";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Alert from "$lib/components/ui/alert/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { LL } from "$lib/i18n/i18n-svelte";
	import { startAuthentication } from "@simplewebauthn/browser";
	import { route } from "$lib/ROUTES";
	import Fingerprint from "@lucide/svelte/icons/fingerprint";
	import Mail from "@lucide/svelte/icons/mail";
	import { getAuthenticationOptions, verifyAuthentication } from "$lib/api/authenticate.remote";
	import { PersistedState } from "runed";
	import { useEmail, changeEmail } from "./data.remote";

	let { data }: { data: PageData } = $props();

	let isAuthenticating = $state(false);
	let errorMessage = $state("");

	// Type-safe persisted state for tracking last used sign-in method per email
	const lastUsedMethod = $derived(new PersistedState<"passkey" | "email" | null>(`signInMethod:${data.email}`, null));

	async function handlePasskeyAuth() {
		isAuthenticating = true;
		errorMessage = "";

		try {
			// Step 1: Get authentication options from server
			const { options } = await getAuthenticationOptions(data.email);

			// Step 2: Prompt user for passkey authentication
			const credential = await startAuthentication({ optionsJSON: options });

			// Step 3: Verify authentication with server
			await verifyAuthentication(credential);

			// Save this method as last used
			lastUsedMethod.current = "passkey";

			// Success! Redirect to home page
			goto(route("/[locale=locale]", { locale: data.email.includes("tietokilta") ? "fi" : "en" }));
		} catch (error) {
			console.error("Passkey authentication error:", error);

			// Handle different error types
			if (error instanceof Error) {
				// User cancelled the passkey prompt
				if (error.name === "NotAllowedError") {
					errorMessage = $LL.auth.passkey.authCancelled();
				}
				// Rate limit error
				else if ("status" in error && error.status === 429) {
					errorMessage = $LL.auth.passkey.rateLimited();
				}
				// All other errors (including wrong account, invalid passkey, etc.)
				else {
					errorMessage = $LL.auth.passkey.authFailed();
				}
			} else {
				errorMessage = $LL.auth.passkey.authFailed();
			}
		} finally {
			isAuthenticating = false;
		}
	}

	// Handle email button click - save method before form submission
	function handleEmailClick() {
		lastUsedMethod.current = "email";
	}
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title>{$LL.auth.signIn()}</Card.Title>
			<Card.Description>
				{$LL.auth.passkey.signingInAs()} <strong class="font-medium text-foreground">{data.email}</strong>
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-6">
			<!-- Passkey authentication button -->
			<div class="relative">
				<Button
					data-testid="sign-in-with-passkey-button"
					onclick={handlePasskeyAuth}
					disabled={isAuthenticating}
					class="w-full"
					size="lg"
					type="button"
				>
					<Fingerprint class="mr-2 h-5 w-5" />
					{#if isAuthenticating}
						{$LL.auth.passkey.authenticating()}
					{:else}
						{$LL.auth.passkey.signInWithPasskey()}
					{/if}
				</Button>
				{#if lastUsedMethod.current === "passkey"}
					<span
						class="pointer-events-none absolute -top-2 -right-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
					>
						({$LL.auth.passkey.lastUsed()})
					</span>
				{/if}
			</div>

			{#if errorMessage}
				<Alert.Root variant="destructive">
					<Alert.Description>{errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}

			<!-- Divider -->
			<div class="relative">
				<Separator />
				<div
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground"
				>
					{$LL.auth.passkey.or()}
				</div>
			</div>

			<!-- Email OTP fallback -->
			<form {...useEmail} class="w-full">
				<div class="relative">
					<Button type="submit" variant="outline" class="w-full" size="lg" onclick={handleEmailClick}>
						<Mail class="mr-2 h-5 w-5" />
						{$LL.auth.passkey.sendEmailCode()}
					</Button>
					{#if lastUsedMethod.current === "email"}
						<span
							class="pointer-events-none absolute -top-2 -right-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
						>
							({$LL.auth.passkey.lastUsed()})
						</span>
					{/if}
				</div>
			</form>

			<!-- Change email -->
			<form {...changeEmail} class="w-full">
				<Button type="submit" variant="ghost" class="w-full">{$LL.auth.passkey.useDifferentEmail()}</Button>
			</form>
		</Card.Content>
	</Card.Root>
</main>
