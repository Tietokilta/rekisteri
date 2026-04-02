/**
 * The default application customization settings.
 * These are used as defaults in the database schema and as fallbacks in the application code.
 */

export const DEFAULT_CUSTOMIZATION = {
  accentColor: "#4f46e5", // Indigo-600
  organizationName: { fi: "Kilta ry", en: "Guild Registered Association" },
  organizationNameShort: { fi: "Kilta", en: "Guild" },
  appName: { fi: "Jäsenrekisteri", en: "Member Registry" },
  businessId: "0123456-7",
  overseerContact: "hallitus@kilta.fi",
  overseerAddress: "Kiltatalo, Otakaari 1, 02150 Espoo",
  privacyPolicy: {
    fi: "Tämä on jäsenrekisterin tietosuojaseloste.",
    en: "This is the privacy policy for the membership registry.",
  },
  organizationRulesUrl: "https://kilta.fi/saannot",
  memberResignRule: "§67",
  memberResignDefaultReason: {
    fi: "§67 nojalla. Liiallinen brainrot.",
    en: "By applying of §67. Too much brainrot.",
  },
} as const;
