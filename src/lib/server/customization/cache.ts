import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { DEFAULT_CUSTOMIZATION } from "./defaults";
import { eq } from "drizzle-orm";

// In-memory cache singleton
let customizationCache: table.AppCustomization | null = null;
let customizationCachePromise: Promise<table.AppCustomization> | null = null;

/**
 * Gets the current app customization settings.
 * Fetches from the database on first load and caches the result.
 * If no settings exist in the DB, inserts and returns text/json defaults.
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
  const [inserted] = await db
    .insert(table.appCustomization)
    .values({ id: 1, ...DEFAULT_CUSTOMIZATION })
    .onConflictDoNothing({ target: table.appCustomization.id })
    .returning();

  if (inserted) {
    return inserted;
  }

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
