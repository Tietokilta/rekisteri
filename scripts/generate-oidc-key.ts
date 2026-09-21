/**
 * @file generate-oidc-key.ts
 * @description Generates a persistent RSA signing key for the Rekisteri OIDC provider.
 *
 * Usage:
 *   pnpm oidc:generate-key
 *   pnpm oidc:generate-key --write   (appends OIDC_SIGNING_KEY_JWK to .env if not present)
 */

import { generateKeyPairSync, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function calculateRfc7638Thumbprint(jwk: Record<string, unknown>): string {
  const canonicalJson = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return createHash("sha256").update(canonicalJson).digest("base64url");
}

function main() {
  console.log("Generating 2048-bit RSA key pair for OIDC issuer...");

  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  const jwk = privateKey.export({ format: "jwk" }) as Record<string, unknown>;
  const kid = calculateRfc7638Thumbprint(jwk);
  jwk.use = "sig";
  jwk.alg = "RS256";
  jwk.kid = kid;

  const jsonJwk = JSON.stringify(jwk);
  const base64Jwk = Buffer.from(jsonJwk).toString("base64");

  console.log("\nKey generated successfully!");
  console.log(`Key ID (kid): ${kid}`);
  console.log(`Algorithm: RS256\n`);

  console.log("--------------------------------------------------------------------------------");
  console.log("Add the Base64-encoded JWK to your .env file:");
  console.log("--------------------------------------------------------------------------------");
  console.log(`OIDC_SIGNING_KEY_JWK="${base64Jwk}"\n`);

  const shouldWrite = process.argv.includes("--write");
  const envPath = path.resolve(process.cwd(), ".env");

  if (shouldWrite) {
    if (fs.existsSync(envPath)) {
      const existingEnv = fs.readFileSync(envPath, "utf8");
      if (existingEnv.includes("OIDC_SIGNING_KEY_JWK")) {
        console.warn("⚠️  .env already contains OIDC_SIGNING_KEY_JWK! Skipping write to prevent accidental overwrite.");
      } else {
        const addition = `\n# OIDC Provider RSA Signing Key (generated ${new Date().toISOString()})\nOIDC_SIGNING_KEY_JWK="${base64Jwk}"\n`;
        fs.appendFileSync(envPath, addition, "utf8");
        console.log(" Added OIDC_SIGNING_KEY_JWK to .env!");
      }
    } else {
      console.warn("⚠️  .env file not found. Please create one from .env.example.");
    }
  } else {
    console.log("Tip: Run `pnpm oidc:generate-key --write` to automatically append this to your .env file.");
  }
}

main();
