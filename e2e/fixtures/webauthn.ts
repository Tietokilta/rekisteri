import type { Page, CDPSession } from "@playwright/test";

export interface VirtualAuthenticatorOptions {
	protocol?: "ctap1/u2f" | "ctap2" | "ctap2_1";
	transport?: "usb" | "nfc" | "ble" | "internal";
	hasResidentKey?: boolean;
	hasUserVerification?: boolean;
	isUserVerified?: boolean;
	automaticPresenceSimulation?: boolean;
}

/**
 * Helper class for testing WebAuthn/passkeys with Playwright
 * Uses Chrome DevTools Protocol to create a virtual authenticator
 */
export class WebAuthnHelper {
	private cdpSession: CDPSession | null = null;
	private authenticatorId: string | null = null;

	constructor(private page: Page) {}

	/**
	 * Enable WebAuthn virtual authenticator
	 * Call this before any passkey operations
	 */
	async enable(options: VirtualAuthenticatorOptions = {}): Promise<string> {
		// Create CDP session
		this.cdpSession = await this.page.context().newCDPSession(this.page);

		// Enable WebAuthn
		await this.cdpSession.send("WebAuthn.enable");

		// Add virtual authenticator with default options for passkeys
		const result = await this.cdpSession.send("WebAuthn.addVirtualAuthenticator", {
			options: {
				protocol: options.protocol ?? "ctap2",
				transport: options.transport ?? "internal",
				hasResidentKey: options.hasResidentKey ?? true,
				hasUserVerification: options.hasUserVerification ?? true,
				isUserVerified: options.isUserVerified ?? true,
				automaticPresenceSimulation: options.automaticPresenceSimulation ?? true,
			},
		});

		this.authenticatorId = result.authenticatorId;
		return this.authenticatorId;
	}

	/**
	 * Get all credentials stored in the virtual authenticator
	 */
	async getCredentials(): Promise<unknown[]> {
		if (!this.cdpSession || !this.authenticatorId) {
			throw new Error("WebAuthn not enabled. Call enable() first.");
		}

		const result = await this.cdpSession.send("WebAuthn.getCredentials", {
			authenticatorId: this.authenticatorId,
		});

		return result.credentials;
	}

	/**
	 * Remove a specific credential from the virtual authenticator
	 */
	async removeCredential(credentialId: string): Promise<void> {
		if (!this.cdpSession || !this.authenticatorId) {
			throw new Error("WebAuthn not enabled. Call enable() first.");
		}

		await this.cdpSession.send("WebAuthn.removeCredential", {
			authenticatorId: this.authenticatorId,
			credentialId,
		});
	}

	/**
	 * Clear all credentials from the virtual authenticator
	 */
	async clearCredentials(): Promise<void> {
		if (!this.cdpSession || !this.authenticatorId) {
			throw new Error("WebAuthn not enabled. Call enable() first.");
		}

		await this.cdpSession.send("WebAuthn.clearCredentials", {
			authenticatorId: this.authenticatorId,
		});
	}

	/**
	 * Disable WebAuthn and clean up
	 */
	async disable(): Promise<void> {
		if (this.cdpSession) {
			if (this.authenticatorId) {
				await this.cdpSession.send("WebAuthn.removeVirtualAuthenticator", {
					authenticatorId: this.authenticatorId,
				});
				this.authenticatorId = null;
			}
			await this.cdpSession.send("WebAuthn.disable");
			await this.cdpSession.detach();
			this.cdpSession = null;
		}
	}
}
