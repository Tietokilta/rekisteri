import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { DEFAULT_CUSTOMISATION } from "./defaults";
import { eq } from "drizzle-orm";

// In-memory cache singleton
let customisationCache: table.AppCustomisation | null = null;

/**
 * Gets the current app customisation settings.
 * Fetches from the database on first load and caches the result.
 * If no settings exist in the DB, inserts and returns text/json defaults.
 */
export async function getCustomisations(): Promise<table.AppCustomisation> {
  if (customisationCache) {
    return customisationCache;
  }

  customisationCache = await loadCustomisations();
  return customisationCache;
}

/**
 * Updates the in-memory cache manually after settings have been updated in the DB.
 */
export async function updateCustomisationCache(): Promise<void> {
  customisationCache = await loadCustomisations();
}

async function loadCustomisations(): Promise<table.AppCustomisation> {
  const [customisations] = await db
    .select()
    .from(table.appCustomisation)
    .where(eq(table.appCustomisation.id, 1))
    .limit(1);

  if (customisations) {
    return customisations;
  }

  const [inserted] = await db
    .insert(table.appCustomisation)
    .values({ id: 1, ...DEFAULT_CUSTOMISATION })
    .returning();

  return (inserted ?? { id: 1, ...DEFAULT_CUSTOMISATION }) as table.AppCustomisation;
}
