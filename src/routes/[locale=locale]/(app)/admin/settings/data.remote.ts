import { error, invalid } from "@sveltejs/kit";
import crypto from "node:crypto";
import { form, getRequestEvent, type RemoteFormInvalidField } from "$app/server";
import { eq } from "drizzle-orm";
import type * as v from "valibot";

import { db } from "#lib/server/db/index.js";
import * as table from "#lib/server/db/schema.js";
import { updateCustomizationCache, getCustomizations } from "#lib/server/customization/cache.js";
import {
  type CustomizationImageField,
  CustomizationUploadError,
  processUploadedFile,
} from "#lib/server/customization/utils.js";
import { getLL } from "#lib/server/i18n.js";
import { userHasAdminWriteAccess } from "#lib/server/auth/admin.js";
import { auditFromEvent } from "#lib/server/audit.js";
import {
  updateCustomizationSchema,
  createOidcClientSchema,
  updateOidcClientSchema,
  deleteOidcClientSchema,
  regenerateOidcClientSecretSchema,
} from "./schema";
import { invalidateClientCache } from "#lib/server/oidc/adapter.js";
import { hashClientSecret } from "#lib/server/oidc/secret.js";
import { env } from "#lib/server/env.js";

type CustomizationInput = v.InferInput<typeof updateCustomizationSchema>;
type ValidCustomization = v.InferOutput<typeof updateCustomizationSchema>;
type ImageRemovals = Record<CustomizationImageField, boolean>;
type UploadedImages = Record<CustomizationImageField, Buffer | undefined>;

const textAuditFields = [
  "accentColor",
  "businessId",
  "overseerContact",
  "overseerAddress",
  "memberResignRule",
] as const;
const localizedAuditFields = [
  "organizationName",
  "organizationLegalName",
  "appName",
  "privacyPolicy",
  "organizationRulesUrl",
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
    accentColor: values.accentColor || null,
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
    organizationRulesUrl: {
      fi: keepExistingLocalizedText(values.organizationRulesUrlFi, existing.organizationRulesUrl, "fi"),
      en: keepExistingLocalizedText(values.organizationRulesUrlEn, existing.organizationRulesUrl, "en"),
    },
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

function invalidUpload(issue: RemoteFormInvalidField<CustomizationInput>, e: CustomizationUploadError) {
  if (e.field === "logo") return invalid(issue.logo(e.message));
  if (e.field === "logoDark") return invalid(issue.logoDark(e.message));
  if (e.field === "favicon") return invalid(issue.favicon(e.message));
  return invalid(issue.faviconDark(e.message));
}

function requireAdminWriteAccess(event: ReturnType<typeof getRequestEvent>) {
  const LL = getLL(event.locals.locale);
  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }
  return LL;
}

export const updateCustomization = form(updateCustomizationSchema, async (values, issue) => {
  const event = getRequestEvent();
  const LL = requireAdminWriteAccess(event);

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
    const updatedCustomizations = await getCustomizations();
    event.locals.customizations = updatedCustomizations;

    return { success: true, message: LL.admin.settings.success() };
  } catch (e) {
    if (e instanceof CustomizationUploadError) {
      return invalidUpload(issue, e);
    }

    console.error("Failed to update app customization", e);
    return invalid(LL.admin.settings.error());
  }
});

// Refresh tokens follow from the offline_access scope (the adapter derives the grant types)
function clientScopes(data: { idTokenClaims: string[] }): string[] {
  return [...new Set(["openid", ...data.idTokenClaims])];
}

function requireOidcAdmin(event: ReturnType<typeof getRequestEvent>) {
  const LL = requireAdminWriteAccess(event);
  if (!env.OIDC_ENABLED) error(404, LL.error.resourceNotFound());
  return LL;
}

async function getExistingOidcClient(clientId: string, LL: ReturnType<typeof getLL>) {
  const [existing] = await db.select().from(table.oidcClient).where(eq(table.oidcClient.clientId, clientId));

  if (!existing) {
    error(404, LL.admin.settings.oidc.error.clientNotFound());
  }
  return existing;
}

export const createOidcClient = form(createOidcClientSchema, async (data) => {
  const event = getRequestEvent();
  requireOidcAdmin(event);

  const clientId = `client_${crypto.randomUUID().replaceAll("-", "")}`;
  const claims = clientScopes(data);
  const uris = data.redirectUris;
  const plainSecret = `sec_${crypto.randomBytes(24).toString("base64url")}`;
  const hashedSecret = hashClientSecret(plainSecret);

  await db.insert(table.oidcClient).values({
    clientId,
    name: data.name,
    clientSecret: hashedSecret,
    redirectUris: uris,
    scopes: claims,
    requireActiveMembership: data.requireActiveMembership,
    type: "authorization_code",
  });

  await auditFromEvent(event, "oidc_client.create", {
    targetType: "oidc_client",
    targetId: clientId,
    metadata: {
      name: data.name,
      redirectUris: uris,
      scopes: claims,
      requireActiveMembership: data.requireActiveMembership,
      type: "authorization_code",
    },
  });

  return { success: true, clientId, clientSecret: plainSecret };
});

export const updateOidcClient = form(updateOidcClientSchema, async (data) => {
  const event = getRequestEvent();
  const LL = requireOidcAdmin(event);
  await getExistingOidcClient(data.id, LL);

  const claims = clientScopes(data);
  const uris = data.redirectUris;

  await db
    .update(table.oidcClient)
    .set({
      name: data.name,
      redirectUris: uris,
      scopes: claims,
      requireActiveMembership: data.requireActiveMembership,
      type: "authorization_code",
    })
    .where(eq(table.oidcClient.clientId, data.id));

  invalidateClientCache(data.id);

  await auditFromEvent(event, "oidc_client.update", {
    targetType: "oidc_client",
    targetId: data.id,
    metadata: {
      name: data.name,
      redirectUris: uris,
      scopes: claims,
      requireActiveMembership: data.requireActiveMembership,
      type: "authorization_code",
    },
  });

  return { success: true };
});

export const deleteOidcClient = form(deleteOidcClientSchema, async (data) => {
  const event = getRequestEvent();
  const LL = requireOidcAdmin(event);
  await getExistingOidcClient(data.id, LL);

  await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, data.id));
  invalidateClientCache(data.id);

  await auditFromEvent(event, "oidc_client.delete", {
    targetType: "oidc_client",
    targetId: data.id,
  });

  return { success: true };
});

export const regenerateOidcClientSecret = form(regenerateOidcClientSecretSchema, async (data) => {
  const event = getRequestEvent();
  const LL = requireOidcAdmin(event);
  const existing = await getExistingOidcClient(data.id, LL);

  const plainSecret = `sec_${crypto.randomBytes(24).toString("base64url")}`;
  const hashedSecret = hashClientSecret(plainSecret);

  // New secret, and every token and consent issued under the old one revoked, together
  await db.transaction(async (tx) => {
    await tx.update(table.oidcClient).set({ clientSecret: hashedSecret }).where(eq(table.oidcClient.clientId, data.id));
    await tx.delete(table.oidcEntity).where(eq(table.oidcEntity.clientId, data.id));
    await tx.delete(table.oidcConsent).where(eq(table.oidcConsent.clientId, data.id));
  });
  invalidateClientCache(data.id);

  await auditFromEvent(event, "oidc_client.regenerate_secret", {
    targetType: "oidc_client",
    targetId: data.id,
    metadata: { name: existing.name },
  });

  return { success: true, clientSecret: plainSecret };
});
