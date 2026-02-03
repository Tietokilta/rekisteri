import { error } from "@sveltejs/kit";
import { getRequestEvent, query, command, form } from "$app/server";
import {
  createRegistrationOptions,
  verifyAndStoreRegistration,
  getUserPasskeys,
  deletePasskey,
  renamePasskey,
} from "$lib/server/auth/passkey";
import { auditPasskeyRegistered, auditPasskeyDeleted } from "$lib/server/audit";
import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { dev } from "$app/environment";
import * as v from "valibot";

// Valibot schema for AuthenticatorTransportFuture
const authenticatorTransportSchema = v.picklist(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);

// Valibot schema for AuthenticatorAttestationResponseJSON
// https://w3c.github.io/webauthn/#dictdef-authenticatorattestationresponsejson
const authenticatorAttestationResponseSchema = v.object({
  clientDataJSON: v.string(), // Base64URLString
  attestationObject: v.string(), // Base64URLString
  authenticatorData: v.optional(v.string()), // Base64URLString
  transports: v.optional(v.array(authenticatorTransportSchema)), // AuthenticatorTransportFuture[]
  publicKeyAlgorithm: v.optional(v.number()), // COSEAlgorithmIdentifier
  publicKey: v.optional(v.string()), // Base64URLString
});

// Valibot schema for RegistrationResponseJSON
// https://w3c.github.io/webauthn/#dictdef-registrationresponsejson
const registrationResponseSchema: v.GenericSchema<RegistrationResponseJSON> = v.looseObject({
  id: v.string(), // Base64URLString
  rawId: v.string(), // Base64URLString
  response: authenticatorAttestationResponseSchema,
  authenticatorAttachment: v.optional(v.picklist(["platform", "cross-platform"])), // AuthenticatorAttachment
  clientExtensionResults: v.looseObject({}), // AuthenticationExtensionsClientOutputs - allow any properties
  type: v.literal("public-key"), // PublicKeyCredentialType
}) as v.GenericSchema<RegistrationResponseJSON>;

const challengeCookieName = "passkey_register_challenge";

/**
 * Generate passkey registration options
 */
export const getRegistrationOptions = command(
  v.string(),
  async (deviceName): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; deviceName: string }> => {
    const { locals, cookies } = getRequestEvent();

    if (!locals.user) {
      throw error(401, "Not authenticated");
    }

    try {
      const options = await createRegistrationOptions(locals.user);

      // Store challenge in cookie for verification
      cookies.set(challengeCookieName, options.challenge, {
        path: "/",
        httpOnly: true,
        secure: !dev,
        sameSite: "strict",
        maxAge: 60 * 5, // 5 minutes
      });

      return { options, deviceName: deviceName || "Unnamed device" };
    } catch (err) {
      console.error("Failed to generate registration options:", err);
      throw error(500, "Failed to generate registration options");
    }
  },
);

/**
 * Verify and store a passkey registration
 */
export const verifyRegistration = command(
  v.object({
    response: registrationResponseSchema,
    deviceName: v.string(),
  }),
  async ({ response, deviceName }): Promise<{ success: boolean }> => {
    const { locals, cookies, request, getClientAddress } = getRequestEvent();

    if (!locals.user) {
      throw error(401, "Not authenticated");
    }

    const challenge = cookies.get(challengeCookieName);
    if (!challenge) {
      throw error(400, "No registration challenge found. Please start registration again.");
    }

    try {
      await verifyAndStoreRegistration(response, challenge, locals.user.id, deviceName || "Unnamed device");

      // Log passkey registration
      const passkeyId = response.id;
      const userAgent = request.headers.get("user-agent") || undefined;
      const clientAddress = getClientAddress();
      await auditPasskeyRegistered(locals.user.id, passkeyId, clientAddress, userAgent, { deviceName });

      // Clear the challenge cookie
      cookies.delete(challengeCookieName, { path: "/" });

      return { success: true };
    } catch (err) {
      console.error("Failed to verify passkey registration:", err);
      // Clear the challenge cookie on error
      cookies.delete(challengeCookieName, { path: "/" });
      throw error(500, "Failed to verify passkey registration");
    }
  },
);

/**
 * List all passkeys for the authenticated user
 */
export const listPasskeys = query(async () => {
  const { locals } = getRequestEvent();

  if (!locals.user) {
    throw error(401, "Not authenticated");
  }

  try {
    const passkeys = await getUserPasskeys(locals.user.id);

    // Return passkeys without sensitive data (no public key)
    const safePasskeys = passkeys.map((passkey) => ({
      id: passkey.id,
      deviceName: passkey.deviceName,
      backedUp: passkey.backedUp,
      transports: passkey.transports,
      createdAt: passkey.createdAt,
      lastUsedAt: passkey.lastUsedAt,
    }));

    return { passkeys: safePasskeys };
  } catch (err) {
    console.error("Failed to list passkeys:", err);
    throw error(500, "Failed to list passkeys");
  }
});

/**
 * Delete a passkey via form submission
 * Uses the form() API for progressive enhancement
 */
export const deletePasskeyForm = form(
  v.object({
    passkeyId: v.pipe(v.string(), v.minLength(1, "Passkey ID is required")),
  }),
  async ({ passkeyId }) => {
    const { locals, request, getClientAddress } = getRequestEvent();

    if (!locals.user) {
      throw error(401, "Not authenticated");
    }

    const success = await deletePasskey(passkeyId, locals.user.id);

    if (!success) {
      throw error(404, "Passkey not found or does not belong to user");
    }

    // Log the deletion
    const userAgent = request.headers.get("user-agent") || undefined;
    const clientAddress = getClientAddress();
    await auditPasskeyDeleted(locals.user.id, passkeyId, clientAddress, userAgent);

    // Refresh the passkey list
    await listPasskeys().refresh();

    return { success: true };
  },
);

/**
 * Rename a passkey via form submission
 * Uses the form() API for progressive enhancement
 */
export const renamePasskeyForm = form(
  v.object({
    passkeyId: v.pipe(v.string(), v.minLength(1, "Passkey ID is required")),
    deviceName: v.pipe(v.string(), v.minLength(1, "Device name is required"), v.maxLength(100, "Device name too long")),
  }),
  async ({ passkeyId, deviceName }) => {
    const { locals } = getRequestEvent();

    if (!locals.user) {
      throw error(401, "Not authenticated");
    }

    const success = await renamePasskey(passkeyId, locals.user.id, deviceName);

    if (!success) {
      throw error(404, "Passkey not found or does not belong to user");
    }

    // Refresh the passkey list
    await listPasskeys().refresh();

    return { success: true };
  },
);
