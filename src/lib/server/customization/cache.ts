import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { DEFAULT_CUSTOMIZATION } from "./defaults";
import { eq } from "drizzle-orm";

// In-memory cache singleton
let customizationCache: table.AppCustomization | null = null;

/**
 * Gets the current app customization settings.
 * Fetches from the database on first load and caches the result.
 * If no settings exist in the DB, inserts and returns text/json defaults.
 */
export async function getCustomizations(): Promise<table.AppCustomization> {
  if (customizationCache) {
    return customizationCache;
  }

  customizationCache = await loadCustomizations();
  return customizationCache;
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

  const [inserted] = await db
    .insert(table.appCustomization)
    .values({ id: 1, ...DEFAULT_CUSTOMIZATION })
    .returning();

  return (inserted ?? { id: 1, ...DEFAULT_CUSTOMIZATION }) as table.AppCustomization;
}
