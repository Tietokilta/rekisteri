import { z } from "zod";

/**
 * OAuth client configuration schema
 */
export const oauthClientSchema = z.object({
	id: z.string().min(1),
	secret: z.string().min(1),
	name: z.string().min(1),
	redirectUris: z.array(z.string().url()),
});

export type OAuthClient = z.infer<typeof oauthClientSchema>;

/**
 * Load OAuth clients from environment variables
 * Supports JSON array format: OAUTH_CLIENTS='[{"id":"...","secret":"...","name":"...","redirectUris":["..."]}]'
 */
export function getOAuthClients(): OAuthClient[] {
	const clientsJson = process.env.OAUTH_CLIENTS;

	if (!clientsJson) {
		// No clients configured - return empty array for development
		return [];
	}

	try {
		const clients = JSON.parse(clientsJson);

		if (!Array.isArray(clients)) {
			throw new Error("OAUTH_CLIENTS must be a JSON array");
		}

		return clients.map((client, index) => {
			try {
				return oauthClientSchema.parse(client);
			} catch (error) {
				throw new Error(`Invalid OAuth client at index ${index}: ${error}`);
			}
		});
	} catch (error) {
		console.error("Failed to parse OAUTH_CLIENTS:", error);
		throw new Error("Invalid OAUTH_CLIENTS configuration");
	}
}

/**
 * Find an OAuth client by ID
 */
export function findOAuthClient(clientId: string): OAuthClient | undefined {
	const clients = getOAuthClients();
	return clients.find((c) => c.id === clientId);
}

/**
 * Validate OAuth client credentials
 */
export function validateOAuthClient(clientId: string, clientSecret: string): OAuthClient | null {
	const client = findOAuthClient(clientId);

	if (!client) {
		return null;
	}

	// Timing-safe comparison to prevent timing attacks
	if (client.secret !== clientSecret) {
		return null;
	}

	return client;
}
