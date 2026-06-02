import type { AppCustomization } from "$lib/server/db/schema";
import { DEFAULT_CUSTOMIZATION } from "./defaults";

export const CUSTOMIZATION_LOGO_MAX_BYTES = 64 * 1024;
export const CUSTOMIZATION_FAVICON_MAX_BYTES = 32 * 1024;

export type CustomizationImageField = "logo" | "logoDark" | "favicon" | "faviconDark";

export class CustomizationUploadError extends Error {
  field: CustomizationImageField;

  constructor(field: CustomizationImageField, message: string) {
    super(message);
    this.field = field;
    this.name = "CustomizationUploadError";
  }
}

/**
 * The flat version of customization used in the admin UI form.
 */
export type CustomizationFormValues = {
  accentColor: string;
  organizationNameFi: string;
  organizationNameEn: string;
  organizationNameShortFi: string;
  organizationNameShortEn: string;
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
 * Maps a database customization record (nested JSON) to flat form values.
 */
export function flattenCustomization(custom: AppCustomization | null): CustomizationFormValues {
  const c = custom || (DEFAULT_CUSTOMIZATION as AppCustomization);

  return {
    accentColor: c.accentColor || DEFAULT_CUSTOMIZATION.accentColor,
    organizationNameFi: c.organizationName?.fi || DEFAULT_CUSTOMIZATION.organizationName.fi,
    organizationNameEn: c.organizationName?.en || DEFAULT_CUSTOMIZATION.organizationName.en,
    organizationNameShortFi: c.organizationNameShort?.fi || DEFAULT_CUSTOMIZATION.organizationNameShort.fi,
    organizationNameShortEn: c.organizationNameShort?.en || DEFAULT_CUSTOMIZATION.organizationNameShort.en,
    appNameFi: c.appName?.fi || DEFAULT_CUSTOMIZATION.appName.fi,
    appNameEn: c.appName?.en || DEFAULT_CUSTOMIZATION.appName.en,
    businessId: c.businessId || DEFAULT_CUSTOMIZATION.businessId,
    overseerContact: c.overseerContact || DEFAULT_CUSTOMIZATION.overseerContact,
    overseerAddress: c.overseerAddress || DEFAULT_CUSTOMIZATION.overseerAddress,
    privacyPolicyFi: c.privacyPolicy?.fi || DEFAULT_CUSTOMIZATION.privacyPolicy.fi,
    privacyPolicyEn: c.privacyPolicy?.en || DEFAULT_CUSTOMIZATION.privacyPolicy.en,
    organizationRulesUrl: c.organizationRulesUrl || DEFAULT_CUSTOMIZATION.organizationRulesUrl,
    memberResignRule: c.memberResignRule || DEFAULT_CUSTOMIZATION.memberResignRule,
    memberResignDefaultReasonFi: c.memberResignDefaultReason?.fi || DEFAULT_CUSTOMIZATION.memberResignDefaultReason.fi,
    memberResignDefaultReasonEn: c.memberResignDefaultReason?.en || DEFAULT_CUSTOMIZATION.memberResignDefaultReason.en,
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

function isLogoField(field: CustomizationImageField): field is "logo" | "logoDark" {
  return field === "logo" || field === "logoDark";
}

function assertSize(field: CustomizationImageField, file: File) {
  const maxBytes = isLogoField(field) ? CUSTOMIZATION_LOGO_MAX_BYTES : CUSTOMIZATION_FAVICON_MAX_BYTES;
  if (file.size > maxBytes) {
    throw new CustomizationUploadError(field, `Must be ${maxBytes / 1024} KB or smaller`);
  }
}

function assertSvg(field: CustomizationImageField, buffer: Buffer) {
  let svg: string;
  try {
    svg = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new CustomizationUploadError(field, "Must be a valid UTF-8 SVG image");
  }

  let normalized = svg.replace(/^\uFEFF/, "").trimStart();
  normalized = normalized.replace(/^<\?xml[^>]*\?>\s*/i, "");
  while (normalized.startsWith("<!--")) {
    const commentEnd = normalized.indexOf("-->");
    if (commentEnd === -1) break;
    normalized = normalized.slice(commentEnd + 3).trimStart();
  }

  if (!/^<svg(?:\s|>)/i.test(normalized)) {
    throw new CustomizationUploadError(field, "Must be an SVG image");
  }
}

function assertPng(field: CustomizationImageField, buffer: Buffer) {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const hasSignature = pngSignature.every((byte, index) => buffer[index] === byte);
  const hasIhdr = buffer.length >= 24 && buffer.toString("ascii", 12, 16) === "IHDR";

  if (!hasSignature || !hasIhdr) {
    throw new CustomizationUploadError(field, "Must be a PNG image");
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== height) {
    throw new CustomizationUploadError(field, "Must be a square PNG image");
  }
}

/**
 * Processes an uploaded customization asset.
 */
export async function processUploadedFile(field: CustomizationImageField, val: unknown): Promise<Buffer | undefined> {
  if (val instanceof File && val.size > 0) {
    assertSize(field, val);

    let buffer = Buffer.from(await val.arrayBuffer()) as Buffer;
    if (isLogoField(field)) {
      assertSvg(field, buffer);
      buffer = resizeSvgTo32(buffer);
    } else {
      assertPng(field, buffer);
    }

    return buffer;
  }
  return undefined;
}
