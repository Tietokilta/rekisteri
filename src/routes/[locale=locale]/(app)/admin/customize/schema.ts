import * as v from "valibot";
import { CUSTOMIZATION_FAVICON_MAX_BYTES, CUSTOMIZATION_LOGO_MAX_BYTES } from "$lib/server/customization/utils";

const isSvgUpload = (file: File) =>
  file.size === 0 || file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

const isPngUpload = (file: File) =>
  file.size === 0 || file.type === "image/png" || file.name.toLowerCase().endsWith(".png");

const isWithinLogoLimit = (file: File) => file.size <= CUSTOMIZATION_LOGO_MAX_BYTES;

const isWithinFaviconLimit = (file: File) => file.size <= CUSTOMIZATION_FAVICON_MAX_BYTES;

export const updateCustomizationSchema = v.object({
  accentColor: v.pipe(v.string(), v.hexColor("Must be a valid hex color")),
  organizationNameFi: v.pipe(v.string(), v.minLength(1)),
  organizationNameEn: v.pipe(v.string(), v.minLength(1)),
  organizationNameShortFi: v.pipe(v.string(), v.minLength(1)),
  organizationNameShortEn: v.pipe(v.string(), v.minLength(1)),
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
