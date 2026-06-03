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
import { updateCustomizationSchema } from "./schema";

type CustomizationInput = v.InferInput<typeof updateCustomizationSchema>;
type ValidCustomization = v.InferOutput<typeof updateCustomizationSchema>;
type ImageRemovals = Record<CustomizationImageField, boolean>;
type UploadedImages = Record<CustomizationImageField, Buffer | undefined>;

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
    const updateData = getCustomizationUpdateData(values, existing, uploaded, getImageRemovals(values));

    await saveCustomization(updateData);

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
