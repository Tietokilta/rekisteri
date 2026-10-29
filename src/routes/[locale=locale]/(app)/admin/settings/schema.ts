import * as v from "valibot";
import { OIDC_SCOPES } from "#lib/shared/oidc.js";
import { CUSTOMIZATION_FAVICON_MAX_BYTES, CUSTOMIZATION_LOGO_MAX_BYTES } from "#lib/shared/customization.js";

const isSvgUpload = (file: File) =>
  file.size === 0 || file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

const isPngUpload = (file: File) =>
  file.size === 0 || file.type === "image/png" || file.name.toLowerCase().endsWith(".png");

const isWithinLogoLimit = (file: File) => file.size <= CUSTOMIZATION_LOGO_MAX_BYTES;

const isWithinFaviconLimit = (file: File) => file.size <= CUSTOMIZATION_FAVICON_MAX_BYTES;

export const updateCustomizationSchema = v.object({
  accentColor: v.optional(v.pipe(v.string(), v.hexColor("Must be a valid hex color"))),
  organizationNameFi: v.pipe(v.string(), v.minLength(1)),
  organizationNameEn: v.pipe(v.string(), v.minLength(1)),
  organizationLegalNameFi: v.pipe(v.string(), v.minLength(1)),
  organizationLegalNameEn: v.pipe(v.string(), v.minLength(1)),
  appNameFi: v.pipe(v.string(), v.minLength(1)),
  appNameEn: v.pipe(v.string(), v.minLength(1)),
  businessId: v.optional(v.string()),
  overseerContact: v.optional(v.union([v.literal(""), v.pipe(v.string(), v.rfcEmail())])),
  overseerAddress: v.optional(v.string()),
  privacyPolicyFi: v.pipe(v.string(), v.minLength(1)),
  privacyPolicyEn: v.pipe(v.string(), v.minLength(1)),
  organizationRulesUrlFi: v.optional(v.union([v.literal(""), v.pipe(v.string(), v.url())])),
  organizationRulesUrlEn: v.optional(v.union([v.literal(""), v.pipe(v.string(), v.url())])),
  memberResignRule: v.optional(v.string()),
  memberResignDefaultReasonFi: v.optional(v.string()),
  memberResignDefaultReasonEn: v.optional(v.string()),
  // Support both File objects (newly uploaded) and strings (existing values).
  // Empty remote form file inputs are omitted, so these are optional instead of nullable.
  logo: v.optional(
    v.union([
      v.pipe(
        v.instance(File),
        v.check(isSvgUpload, "Must be an SVG image"),
        v.check(isWithinLogoLimit, "Must be 64 KB or smaller"),
      ),
      v.string(),
    ]),
  ),
  logoDark: v.optional(
    v.union([
      v.pipe(
        v.instance(File),
        v.check(isSvgUpload, "Must be an SVG image"),
        v.check(isWithinLogoLimit, "Must be 64 KB or smaller"),
      ),
      v.string(),
    ]),
  ),
  favicon: v.optional(
    v.union([
      v.pipe(
        v.instance(File),
        v.check(isPngUpload, "Must be a PNG image"),
        v.check(isWithinFaviconLimit, "Must be 32 KB or smaller"),
      ),
      v.string(),
    ]),
  ),
  faviconDark: v.optional(
    v.union([
      v.pipe(
        v.instance(File),
        v.check(isPngUpload, "Must be a PNG image"),
        v.check(isWithinFaviconLimit, "Must be 32 KB or smaller"),
      ),
      v.string(),
    ]),
  ),
  removeLogo: v.optional(v.literal("true")),
  removeLogoDark: v.optional(v.literal("true")),
  removeFavicon: v.optional(v.literal("true")),
  removeFaviconDark: v.optional(v.literal("true")),
});

const OIDC_SCOPE_KEYS = OIDC_SCOPES.map((scope) => scope.key);

const scopesSchema = v.optional(v.array(v.picklist(OIDC_SCOPE_KEYS)), []);

const checkboxSchema = v.optional(
  v.pipe(
    v.union([v.boolean(), v.string()]),
    v.transform((val) => val === true || val === "true" || val === "on"),
  ),
  false,
);

// What oidc-provider accepts for a web client: absolute https URLs (http only on this machine), no
// fragment. Checked here so the admin gets an error instead of a client that can't sign anyone in.
function isValidRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (url.protocol === "https:" || (url.protocol === "http:" && local)) && !uri.includes("#");
  } catch {
    return false;
  }
}

const redirectUrisSchema = v.pipe(
  v.optional(v.string(), ""),
  v.transform((text) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  ),
  v.minLength(1, "At least one redirect URI is required"),
  v.check(
    (uris) => uris.every((uri) => isValidRedirectUri(uri)),
    "Redirect URIs must be absolute https URLs (http only for localhost) without a #fragment",
  ),
);

const oidcClientFields = {
  name: v.pipe(v.string(), v.trim(), v.minLength(1, "Name is required"), v.maxLength(100)),
  redirectUris: redirectUrisSchema,
  idTokenClaims: scopesSchema,
  requireActiveMembership: checkboxSchema,
};

export const createOidcClientSchema = v.object(oidcClientFields);

export const updateOidcClientSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  ...oidcClientFields,
});

export const deleteOidcClientSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
});

export const regenerateOidcClientSecretSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
});
