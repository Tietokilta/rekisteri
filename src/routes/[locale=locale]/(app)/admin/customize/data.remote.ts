import { form, getRequestEvent } from "$app/server";
import { error, invalid } from "@sveltejs/kit";
import type { InvalidField } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type * as v from "valibot";

import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { updateCustomizationCache, getCustomizations } from "$lib/server/customization/cache";
import {
  type CustomizationImageField,
  CustomizationUploadError,
  processUploadedFile,
} from "$lib/server/customization/utils";
import { getLL } from "$lib/server/i18n";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";
import { auditFromEvent } from "$lib/server/audit";
import { updateCustomizationSchema } from "./schema";

type CustomizationInput = v.InferInput<typeof updateCustomizationSchema>;
type ValidCustomization = v.InferOutput<typeof updateCustomizationSchema>;
type ImageRemovals = Record<CustomizationImageField, boolean>;
type UploadedImages = Record<CustomizationImageField, Buffer | undefined>;

const textAuditFields = [
  "accentColor",
  "businessId",
  "overseerContact",
  "overseerAddress",
  "organizationRulesUrl",
  "memberResignRule",
] as const;
const localizedAuditFields = [
  "organizationName",
  "organizationLegalName",
  "appName",
  "privacyPolicy",
  "memberResignDefaultReason",
] as const;
const imageAuditFields = [
  "logo",
  "logoDark",
  "favicon",
  "faviconDark",
] as const satisfies readonly CustomizationImageField[];

function getImageRemovals(values: ValidCustomization): ImageRemovals {
  return {
    logo: values.removeLogo === "true",
    logoDark: values.removeLogoDark === "true",
    favicon: values.removeFavicon === "true",
    faviconDark: values.removeFaviconDark === "true",
  };
}

async function processUploadedImages(values: ValidCustomization): Promise<UploadedImages> {
  return {
    logo: await processUploadedFile("logo", values.logo),
    logoDark: await processUploadedFile("logoDark", values.logoDark),
    favicon: await processUploadedFile("favicon", values.favicon),
    faviconDark: await processUploadedFile("faviconDark", values.faviconDark),
  };
}

function keepExistingText(value: string | undefined, existing: string) {
  return value || existing;
}

function keepExistingLocalizedText(
  value: string | undefined,
  existing: table.LocalizedString | null | undefined,
  locale: keyof table.LocalizedString,
) {
  return value || existing?.[locale] || "";
}

function keepExistingImage(uploaded: Buffer | undefined, remove: boolean, existing: Buffer | null) {
  return uploaded ?? (remove ? null : existing);
}

function getCustomizationUpdateData(
  values: ValidCustomization,
  existing: table.AppCustomization,
  uploaded: UploadedImages,
  removals: ImageRemovals,
) {
  return {
    accentColor: values.accentColor,
    organizationName: {
      fi: values.organizationNameFi,
      en: values.organizationNameEn,
    },
    organizationLegalName: {
      fi: values.organizationLegalNameFi,
      en: values.organizationLegalNameEn,
    },
    appName: { fi: values.appNameFi, en: values.appNameEn },
    businessId: keepExistingText(values.businessId, existing.businessId),
    overseerContact: keepExistingText(values.overseerContact, existing.overseerContact),
    overseerAddress: keepExistingText(values.overseerAddress, existing.overseerAddress),
    privacyPolicy: { fi: values.privacyPolicyFi, en: values.privacyPolicyEn },
    organizationRulesUrl: keepExistingText(values.organizationRulesUrl, existing.organizationRulesUrl),
    memberResignRule: keepExistingText(values.memberResignRule, existing.memberResignRule ?? ""),
    memberResignDefaultReason: {
      fi: keepExistingLocalizedText(values.memberResignDefaultReasonFi, existing.memberResignDefaultReason, "fi"),
      en: keepExistingLocalizedText(values.memberResignDefaultReasonEn, existing.memberResignDefaultReason, "en"),
    },
    logo: keepExistingImage(uploaded.logo, removals.logo, existing.logo),
    logoDark: keepExistingImage(uploaded.logoDark, removals.logoDark, existing.logoDark),
    favicon: keepExistingImage(uploaded.favicon, removals.favicon, existing.favicon),
    faviconDark: keepExistingImage(uploaded.faviconDark, removals.faviconDark, existing.faviconDark),
    updatedAt: new Date(),
  };
}

type CustomizationUpdateData = ReturnType<typeof getCustomizationUpdateData>;

function localizedTextEquals(a: table.LocalizedString, b: table.LocalizedString) {
  return a.fi === b.fi && a.en === b.en;
}

function imageEquals(a: Buffer | null, b: Buffer | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.equals(b);
}

function getChangedCustomizationFields(existing: table.AppCustomization, updateData: CustomizationUpdateData) {
  const changedFields: string[] = [];

  for (const field of textAuditFields) {
    if (existing[field] !== updateData[field]) changedFields.push(field);
  }

  for (const field of localizedAuditFields) {
    if (!localizedTextEquals(existing[field], updateData[field])) changedFields.push(field);
  }

  for (const field of imageAuditFields) {
    if (!imageEquals(existing[field], updateData[field])) changedFields.push(field);
  }

  return changedFields;
}

function getCustomizationAuditMetadata(
  existing: table.AppCustomization,
  updateData: CustomizationUpdateData,
  uploaded: UploadedImages,
  removals: ImageRemovals,
) {
  return {
    changedFields: getChangedCustomizationFields(existing, updateData),
    uploadedImages: imageAuditFields.filter((field) => uploaded[field] !== undefined),
    removedImages: imageAuditFields.filter((field) => removals[field]),
  };
}

async function saveCustomization(updateData: ReturnType<typeof getCustomizationUpdateData>) {
  const [updated] = await db
    .update(table.appCustomization)
    .set(updateData)
    .where(eq(table.appCustomization.id, 1))
    .returning({ id: table.appCustomization.id });

  if (!updated) {
    throw new Error("App customization singleton is missing");
  }
}

function invalidUpload(issue: InvalidField<CustomizationInput>, e: CustomizationUploadError) {
  if (e.field === "logo") return invalid(issue.logo(e.message));
  if (e.field === "logoDark") return invalid(issue.logoDark(e.message));
  if (e.field === "favicon") return invalid(issue.favicon(e.message));
  return invalid(issue.faviconDark(e.message));
}

export const updateCustomization = form(updateCustomizationSchema, async (values, issue) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  try {
    const uploaded = await processUploadedImages(values);
    const existing = await getCustomizations();
    const removals = getImageRemovals(values);
    const updateData = getCustomizationUpdateData(values, existing, uploaded, removals);
    const auditMetadata = getCustomizationAuditMetadata(existing, updateData, uploaded, removals);

    await saveCustomization(updateData);
    if (auditMetadata.changedFields.length > 0) {
      await auditFromEvent(event, "app_customization.update", {
        targetType: "app_customization",
        targetId: "1",
        metadata: auditMetadata,
      });
    }

    await updateCustomizationCache();
    event.locals.customizations = await getCustomizations();

    return { success: true, message: LL.admin.customize.success() };
  } catch (e) {
    if (e instanceof CustomizationUploadError) {
      return invalidUpload(issue, e);
    }

    console.error("Failed to update customizations", e);
    return invalid(LL.admin.customize.error());
  }
});
