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

export interface OidcClaimDefinition {
  readonly key: string;
  readonly scope: OidcScopeKey;
  readonly title: { fi: string; en: string };
  readonly description: { fi: string; en: string };
}

// Mandatory claims that are part of the openid definition. Same as openid scope.
export const OPENID_CLAIMS: readonly OidcClaimDefinition[] = [
  {
    key: "sub",
    scope: "openid",
    title: { fi: "Käyttäjän ID (Subject)", en: "Subject (User ID)" },
    description: { fi: "Käyttäjän uniikki tunniste järjestelmässä", en: "Unique user identifier in system" },
  },
  {
    key: "iss",
    scope: "openid",
    title: { fi: "Myöntäjä (Issuer)", en: "Issuer URL" },
    description: { fi: "Identiteettipalvelun osoite", en: "Identity provider issuer URL" },
  },
  {
    key: "aud",
    scope: "openid",
    title: { fi: "Vastaanottaja (Audience)", en: "Audience" },
    description: { fi: "Asiakassovelluksen asiakastunnus (client_id)", en: "Application client_id" },
  },
  {
    key: "iat",
    scope: "openid",
    title: { fi: "Myöntämisaika (Issued At)", en: "Issued at" },
    description: { fi: "Tokenin luontihetken Unix-aikaleima", en: "Unix timestamp of token issuance" },
  },
  {
    key: "exp",
    scope: "openid",
    title: { fi: "Vanhenemisaika (Expiration)", en: "Expiration time" },
    description: { fi: "Tokenin vanhenemishetken Unix-aikaleima", en: "Unix timestamp of token expiration" },
  },
] as const;

// Contains all public and private claims supported by rekisteri.
export const OPTIONAL_CLAIMS: readonly OidcClaimDefinition[] = [
  {
    key: "refresh_token",
    scope: "offline_access",
    title: { fi: "Virkistyspoletti", en: "Refresh Token" },
    description: { fi: "", en: "" },
  },
  // Profile claims
  {
    key: "given_name",
    scope: "profile",
    title: { fi: "Etunimet", en: "Given names" },
    description: { fi: "Käyttäjän viralliset etunimet", en: "User's official given names" },
  },
  {
    key: "family_name",
    scope: "profile",
    title: { fi: "Sukunimi", en: "Family name" },
    description: { fi: "Käyttäjän sukunimi", en: "User's family name" },
  },
  {
    key: "locale",
    scope: "profile",
    title: { fi: "Asiointikieli", en: "Preferred language" },
    description: { fi: "Käyttäjän valitsema asiointikieli (fi, en, sv)", en: "User's preferred language code" },
  },
  {
    // Private claim
    key: "verified_student",
    scope: "profile",
    title: { fi: "Aalto-opiskelija", en: "Verified student" },
    description: { fi: "Vahvistettu Aalto-yliopiston opiskelijastatus", en: "Verified Aalto student status boolean" },
  },
  // Email claims
  {
    // Private claim
    key: "primary_email",
    scope: "email",
    title: { fi: "Pääsähköposti", en: "Primary email" },
    description: { fi: "Käyttäjän Pääsähköpostiosoite", en: "User's primary email address" },
  },
  {
    // Private claim
    key: "verified_emails",
    scope: "email",
    title: { fi: "Vahvistetut sähköpostit", en: "Verified emails" },
    description: {
      fi: "Lista kaikista käyttäjän vahvistetuista sähköposteista",
      en: "Array of all verified email addresses",
    },
  },
  {
    // Private claim
    key: "optional_emails_allowed",
    scope: "email",
    title: { fi: "Tiedotelupa", en: "Optional emails allowed" },
    description: { fi: "Sallitaanko valinnaisten järjestötiedotteiden lähetys", en: "Permission for optional emails" },
  },
  // Membership claims
  {
    // Private claim
    key: "active_memberships",
    scope: "membership",
    title: { fi: "Aktiiviset jäsenyydet", en: "Active memberships" },
    description: {
      fi: "Lista käyttäjän aktiivisten jäsenyyksien tyyppitunnisteista",
      en: "Array of active membership type identifiers",
    },
  },
] as const;

export const ALL_CLAIMS = [...OPENID_CLAIMS, ...OPTIONAL_CLAIMS];

export const OPENID_CLAIM_KEYS = new Set(OPENID_CLAIMS.map((c) => c.key));

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
    claims: ["given_name", "family_name", "locale", "verified_student"],
  },
  {
    key: "email",
    title: { fi: "Sähköposti", en: "Email" },
    icon: "Mail",
    claims: ["primary_email", "verified_emails", "optional_emails_allowed"],
  },
  {
    key: "membership",
    title: { fi: "Jäsenyys", en: "Membership" },
    icon: "IdCard",
    claims: ["active_memberships"],
  },
] as const;
