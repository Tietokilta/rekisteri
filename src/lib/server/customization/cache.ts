import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

// In-memory cache singleton
let customizationCache: table.AppCustomization | null = null;
let customizationCachePromise: Promise<table.AppCustomization> | null = null;

/**
 * Gets the current app customization settings.
 * Fetches from the database on first load and caches the result.
 * The singleton row is inserted by the migration and must exist at runtime.
 */
export async function getCustomizations(): Promise<table.AppCustomization> {
  if (customizationCache) {
    return customizationCache;
  }

  customizationCachePromise ??= loadCustomizations()
    .then((customizations) => {
      customizationCache = customizations;
      return customizations;
    })
    .finally(() => {
      customizationCachePromise = null;
    });

  return customizationCachePromise;
}

/**
 * Updates the in-memory cache manually after settings have been updated in the DB.
 */
export async function updateCustomizationCache(): Promise<void> {
  customizationCache = await loadCustomizations();
}

async function loadCustomizations(): Promise<table.AppCustomization> {
  const [customizations] = await db
    .select()
    .from(table.appCustomization)
    .where(eq(table.appCustomization.id, 1))
    .limit(1);

  if (customizations) {
    return customizations;
  }

  throw new Error("App customization singleton is missing");
}
