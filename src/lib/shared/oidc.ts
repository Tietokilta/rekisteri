/* OIDC scopes are different from the OAuth2 scopes.
 * OIDC scopes are basically categories of claim values where as OAuth2 scopes are
 * capabilities allowed (like read:user and write:membership). OIDC scopes are either
 * public (defined by the OIDC specification) or private (defined by the identity provider).
 */

// Membership is a private (custom) scope.
export type OidcScopeKey = "openid" | "profile" | "email" | "membership" | "offline_access";

export interface OidcScope {
  readonly key: OidcScopeKey;
  readonly title: { fi: string; en: string };
  readonly icon: string;
  readonly claims: readonly string[];
}

export const OIDC_SCOPES: readonly OidcScope[] = [
  {
    key: "openid",
    title: { fi: "OpenID", en: "OpenID" },
    icon: "FingerprintPattern",
    claims: ["sub", "iss", "aud", "iat", "exp"],
  },
  {
    key: "offline_access",
    title: { fi: "Polettien päivitys taustalla", en: "Token refreshing in the background" },
    icon: "CloudSync",
    claims: ["refresh_token"],
  },
  {
    key: "profile",
    title: { fi: "Profiili", en: "Profile" },
    icon: "User",
    claims: ["given_name", "family_name", "locale", "aalto_email_verified"],
  },
  {
    key: "email",
    title: { fi: "Sähköposti", en: "Email" },
    icon: "Mail",
    claims: ["email", "email_verified", "verified_emails", "optional_emails_allowed"],
  },
  {
    key: "membership",
    title: { fi: "Jäsenyys", en: "Membership" },
    icon: "IdCard",
    claims: ["active_memberships"],
  },
] as const;
