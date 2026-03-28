import * as v from "valibot";

export const updateCustomisationSchema = v.object({
  accentColor: v.optional(v.string()),
  organizationNameFi: v.pipe(v.string(), v.minLength(1)),
  organizationNameEn: v.pipe(v.string(), v.minLength(1)),
  appNameFi: v.pipe(v.string(), v.minLength(1)),
  appNameEn: v.pipe(v.string(), v.minLength(1)),
  businessId: v.optional(v.string()),
  overseerContact: v.optional(v.string()),
  overseerAddress: v.optional(v.string()),
  privacyPolicyFi: v.pipe(v.string(), v.minLength(1)),
  privacyPolicyEn: v.pipe(v.string(), v.minLength(1)),
  organizationRulesUrl: v.optional(v.union([v.literal(""), v.pipe(v.string(), v.url())])),
  memberResignRule: v.optional(v.string()),
  memberResignDefaultReasonFi: v.optional(v.string()),
  memberResignDefaultReasonEn: v.optional(v.string()),
  // Support both File objects (newly uploaded) and strings (existing values)
  logo: v.optional(
    v.nullable(
      v.union([
        v.pipe(
          v.instance(File),
          v.check((f) => f.size === 0 || f.type === "image/svg+xml", "Must be an SVG image"),
        ),
        v.string(),
      ]),
    ),
  ),
  logoDark: v.optional(
    v.nullable(
      v.union([
        v.pipe(
          v.instance(File),
          v.check((f) => f.size === 0 || f.type === "image/svg+xml", "Must be an SVG image"),
        ),
        v.string(),
      ]),
    ),
  ),
  favicon: v.optional(
    v.nullable(
      v.union([
        v.pipe(
          v.instance(File),
          v.check((f) => f.size === 0 || f.type === "image/png", "Must be a PNG image"),
        ),
        v.string(),
      ]),
    ),
  ),
  faviconDark: v.optional(
    v.nullable(
      v.union([
        v.pipe(
          v.instance(File),
          v.check((f) => f.size === 0 || f.type === "image/png", "Must be a PNG image"),
        ),
        v.string(),
      ]),
    ),
  ),
  removeLogo: v.optional(v.literal("true")),
  removeLogoDark: v.optional(v.literal("true")),
  removeFavicon: v.optional(v.literal("true")),
  removeFaviconDark: v.optional(v.literal("true")),
});
