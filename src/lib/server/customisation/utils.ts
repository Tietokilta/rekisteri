import type { AppCustomisation } from "$lib/server/db/schema";
import { DEFAULT_CUSTOMISATION } from "./defaults";

/**
 * The flat version of customisation used in the admin UI form.
 */
export type CustomisationFormValues = {
  accentColor: string;
  organizationNameFi: string;
  organizationNameEn: string;
  appNameFi: string;
  appNameEn: string;
  businessId: string;
  overseerContact: string;
  overseerAddress: string;
  privacyPolicyFi: string;
  privacyPolicyEn: string;
  organizationRulesUrl: string;
  memberResignRule: string;
  memberResignDefaultReasonFi: string;
  memberResignDefaultReasonEn: string;
};

/**
 * Maps a database customisation record (nested JSON) to flat form values.
 */
export function flattenCustomisation(custom: AppCustomisation | null): CustomisationFormValues {
  const c = custom || (DEFAULT_CUSTOMISATION as AppCustomisation);

  return {
    accentColor: c.accentColor || DEFAULT_CUSTOMISATION.accentColor,
    organizationNameFi: c.organizationName?.fi || DEFAULT_CUSTOMISATION.organizationName.fi,
    organizationNameEn: c.organizationName?.en || DEFAULT_CUSTOMISATION.organizationName.en,
    appNameFi: c.appName?.fi || DEFAULT_CUSTOMISATION.appName.fi,
    appNameEn: c.appName?.en || DEFAULT_CUSTOMISATION.appName.en,
    businessId: c.businessId || DEFAULT_CUSTOMISATION.businessId,
    overseerContact: c.overseerContact || DEFAULT_CUSTOMISATION.overseerContact,
    overseerAddress: c.overseerAddress || DEFAULT_CUSTOMISATION.overseerAddress,
    privacyPolicyFi: c.privacyPolicy?.fi || DEFAULT_CUSTOMISATION.privacyPolicy.fi,
    privacyPolicyEn: c.privacyPolicy?.en || DEFAULT_CUSTOMISATION.privacyPolicy.en,
    organizationRulesUrl: c.organizationRulesUrl || DEFAULT_CUSTOMISATION.organizationRulesUrl,
    memberResignRule: c.memberResignRule || DEFAULT_CUSTOMISATION.memberResignRule,
    memberResignDefaultReasonFi: c.memberResignDefaultReason?.fi || DEFAULT_CUSTOMISATION.memberResignDefaultReason.fi,
    memberResignDefaultReasonEn: c.memberResignDefaultReason?.en || DEFAULT_CUSTOMISATION.memberResignDefaultReason.en,
  };
}

/**
 * Resizes an SVG to 32x32 by updating its viewBox and width/height attributes.
 */
export function resizeSvgTo32(buffer: Buffer): Buffer {
  let svg = buffer.toString("utf8");

  const svgMatch = svg.match(/<svg([^>]*)>/i);
  if (!svgMatch) return buffer;

  let attrs = svgMatch[1] || "";

  if (!/viewBox\s*=/i.test(attrs)) {
    const wMatch = attrs.match(/width\s*=\s*['"]([^'"]+)['"]/i);
    const hMatch = attrs.match(/height\s*=\s*['"]([^'"]+)['"]/i);
    if (wMatch && hMatch) {
      const w = Number.parseFloat(wMatch[1] as string);
      const h = Number.parseFloat(hMatch[1] as string);
      if (!Number.isNaN(w) && !Number.isNaN(h)) {
        attrs += ` viewBox="0 0 ${w} ${h}"`;
      }
    }
  }

  attrs = attrs.replaceAll(/\bwidth\s*=\s*['"][^'"]*['"]/gi, "");
  attrs = attrs.replaceAll(/\bheight\s*=\s*['"][^'"]*['"]/gi, "");
  attrs = attrs.trim() + ' width="32" height="32"';
  svg = svg.replace(svgMatch[0], `<svg ${attrs}>`);

  return Buffer.from(svg, "utf8");
}

/**
 * Processes an uploaded file (logo or favicon).
 */
export async function processUploadedFile(val: unknown): Promise<Buffer | undefined> {
  if (val instanceof File && val.size > 0) {
    let buffer = Buffer.from(await val.arrayBuffer()) as Buffer;
    if (val.type === "image/svg+xml" || val.name.toLowerCase().endsWith(".svg")) {
      buffer = resizeSvgTo32(buffer);
    }
    return buffer;
  }
  return undefined;
}
