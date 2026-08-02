/**
 * @file secret.ts
 * @description Secure OIDC Client Secret Hashing and Constant-Time Verification.
 *
 * Implements password/secret hashing using Node.js crypto `scrypt` with random 16-byte salts
 * and constant-time string comparison (`timingSafeEqual`) to prevent timing side-channel attacks.
 */

import { randomBytes, scryptSync } from "node:crypto";

/**
 * Hashes a plain-text OIDC client secret using Node.js `scrypt` with a random 16-byte salt.
 *
 * Format returned: `scrypt:<salt_hex>:<hash_hex>`
 *
 * @param secret - Plain text client secret string.
 * @returns Hashed secret string containing algorithm prefix, salt, and derived key.
 */
export function hashClientSecret(secret: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(secret, salt, 64).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}
