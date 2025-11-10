<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Item from "$lib/components/ui/item/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { startRegistration } from "@simplewebauthn/browser";
	import { LL } from "$lib/i18n/i18n-svelte";
	import FingerprintIcon from "@lucide/svelte/icons/fingerprint";
	import XIcon from "@lucide/svelte/icons/x";
	import { listPasskeys, getRegistrationOptions, verifyRegistration } from "$lib/api/passkeys.remote";

	let { user } = $props<{ user: { id: string; email: string } | null }>();

	let showBanner = $state(false);
	let showNameInput = $state(false);
	let deviceNameInput = $state("");
	let pendingCredential = $state<any>(null);
	let isRegistering = $state(false);
	let errorMessage = $state("");

	const DISMISSED_KEY = "passkey_banner_dismissed";

	// Check passkeys whenever user changes
	$effect(() => {
		checkPasskeys();
	});

	async function checkPasskeys() {
		// Don't show if not logged in
		if (!user) {
			showBanner = false;
			return;
		}

		// Don't show if user previously dismissed
		if (localStorage.getItem(DISMISSED_KEY) === "true") return;

		// Check if user already has passkeys
		try {
			const { passkeys } = await listPasskeys();
			if (passkeys.length === 0) {
				showBanner = true;
			}
		} catch (error) {
			console.error("Failed to check passkeys:", error);
		}
	}

	function dismiss() {
		localStorage.setItem(DISMISSED_KEY, "true");
		showBanner = false;
	}

	async function startPasskeyRegistration() {
		if (!user) return;

		isRegistering = true;
		errorMessage = "";

		try {
			// Step 1: Get registration options with temporary name
			const { options } = await getRegistrationOptions(getDeviceName());

			// Step 2: Create passkey (WebAuthn ceremony)
			const credential = await startRegistration({ optionsJSON: options });

			// Step 3: Store credential and show name input
			pendingCredential = credential;
			showNameInput = true;
			deviceNameInput = "";
		} catch (error) {
			console.error("Passkey registration error:", error);
			if (error instanceof Error) {
				// Map WebAuthn error types to user-friendly messages
				if (error.name === "NotAllowedError") {
					errorMessage = $LL.auth.passkey.regCancelled();
				} else if (error.name === "InvalidStateError") {
					errorMessage = $LL.auth.passkey.regAlreadyRegistered();
				} else {
					errorMessage = $LL.auth.passkey.regFailed();
				}
			}
		} finally {
			isRegistering = false;
		}
	}

	async function savePasskeyName() {
		if (!pendingCredential) return;

		isRegistering = true;
		errorMessage = "";

		try {
			// Use input or fall back to date-based name
			const deviceName = deviceNameInput.trim() || getDeviceName();

			// Verify and save with chosen name
			await verifyRegistration({ response: pendingCredential, deviceName });

			// Success! Hide banner
			showBanner = false;
			showNameInput = false;
			pendingCredential = null;
			localStorage.setItem(DISMISSED_KEY, "true");
		} catch (error) {
			console.error("Passkey verification error:", error);
			errorMessage = $LL.auth.passkey.regFailed();
		} finally {
			isRegistering = false;
		}
	}

	function getDeviceName(): string {
		// Use current date as default name (more reliable than platform detection)
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		return `Passkey ${year}-${month}-${day}`;
	}
</script>

{#if showBanner}
	<div class="w-full max-w-lg">
		<Item.Root variant="outline">
			<Item.Media variant="icon">
				<FingerprintIcon />
			</Item.Media>
			<Item.Content>
				{#if showNameInput}
					<Item.Title>{$LL.auth.passkey.nameThisPasskey()}</Item.Title>
					<div class="mt-2 space-y-2">
						<Input
							id="passkey-name"
							type="text"
							bind:value={deviceNameInput}
							placeholder={getDeviceName()}
							disabled={isRegistering}
							onkeydown={(e) => {
								if (e.key === "Enter") savePasskeyName();
							}}
						/>
						<p class="text-sm text-muted-foreground">{$LL.auth.passkey.nameOptional()}</p>
					</div>
				{:else}
					<Item.Title>{$LL.auth.passkey.bannerTitle()}</Item.Title>
					{#if errorMessage}
						<Item.Description class="text-destructive">{errorMessage}</Item.Description>
					{/if}
				{/if}
			</Item.Content>
			<Item.Actions>
				{#if showNameInput}
					<Button onclick={savePasskeyName} disabled={isRegistering} size="sm" variant="default">
						{isRegistering ? $LL.auth.passkey.saving() : $LL.auth.passkey.save()}
					</Button>
				{:else}
					<Button onclick={startPasskeyRegistration} disabled={isRegistering} size="sm" variant="default">
						{isRegistering ? $LL.auth.passkey.settingUp() : $LL.auth.passkey.bannerSetup()}
					</Button>
					<Button onclick={dismiss} size="sm" variant="ghost" class="h-8 w-8 p-0">
						<XIcon class="h-4 w-4" />
						<span class="sr-only">Dismiss</span>
					</Button>
				{/if}
			</Item.Actions>
		</Item.Root>
	</div>
{/if}
