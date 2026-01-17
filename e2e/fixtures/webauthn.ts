import type { Page, CDPSession } from "@playwright/test";

/**
 * WebAuthn Helper for E2E Testing
 *
 * Provides virtual authenticator setup for testing passkey functionality.
 * Uses Chrome DevTools Protocol to simulate WebAuthn hardware.
 */
export class WebAuthnHelper {
	private cdpSession: CDPSession | null = null;
	private authenticatorId: string | null = null;
	private page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	/**
	 * Enable virtual authenticator with passkey-compatible defaults
	 * (CTAP2, internal transport, resident keys, automatic presence)
	 */
	async enable(): Promise<void> {
		this.cdpSession = await this.page.context().newCDPSession(this.page);
		await this.cdpSession.send("WebAuthn.enable");

		const result = await this.cdpSession.send("WebAuthn.addVirtualAuthenticator", {
			options: {
				protocol: "ctap2",
				transport: "internal",
				hasResidentKey: true,
				hasUserVerification: true,
				isUserVerified: true,
				automaticPresenceSimulation: true,
			},
		});

		this.authenticatorId = result.authenticatorId;
	}

	/**
	 * Disable authenticator and clean up resources
	 */
	async disable(): Promise<void> {
		if (this.cdpSession && this.authenticatorId) {
			await this.cdpSession.send("WebAuthn.removeVirtualAuthenticator", {
				authenticatorId: this.authenticatorId,
			});
			this.authenticatorId = null;
		}
		if (this.cdpSession) {
			await this.cdpSession.send("WebAuthn.disable");
			await this.cdpSession.detach();
			this.cdpSession = null;
		}
	}
}
