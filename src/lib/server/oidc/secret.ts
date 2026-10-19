/**
 * @file secret.ts
 * @description Secure OIDC Client Secret Hashing and Constant-Time Verification.
 *
 * Implements password/secret hashing using Node.js crypto `scrypt` with random 16-byte salts
 * and constant-time string comparison (`timingSafeEqual`) to prevent timing side-channel attacks.
 */

import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

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

/**
 * Verifies an incoming plain client secret against a stored hashed secret asynchronously.
 * Offloads CPU-intensive scrypt hashing from the main event loop to the libuv worker pool.
 * Uses `timingSafeEqual` to guarantee constant-time execution and mitigate timing attacks.
 * Also provides backwards-compatible fallback for legacy unhashed plain secret strings.
 *
 * @param plainSecret - The plain-text secret provided by the client during token authentication.
 * @param storedSecret - The stored hash string (or legacy plain text) from the database.
 * @returns `Promise<boolean>` resolving to `true` if the secret matches, `false` otherwise.
 */
export async function verifyClientSecret(
  plainSecret: string,
  storedSecret: string | undefined | null,
): Promise<boolean> {
  if (!storedSecret || !plainSecret) return false;

  if (storedSecret.startsWith("scrypt:")) {
    const parts = storedSecret.split(":");
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expectedHashHex = parts[2];
    if (!salt || !expectedHashHex) return false;

    const actualHashBuf = (await scryptAsync(plainSecret, salt, 64)) as Buffer;
    const expectedBuf = Buffer.from(expectedHashHex, "hex");
    if (expectedBuf.length !== actualHashBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualHashBuf);
  }

  // Fallback constant-time comparison for legacy unhashed secrets
  const expectedBuf = Buffer.from(storedSecret);
  const actualBuf = Buffer.from(plainSecret);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
