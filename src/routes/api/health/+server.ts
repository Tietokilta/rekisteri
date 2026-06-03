import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { json } from "@sveltejs/kit";
import { checkMailgunHealth } from "$lib/server/mailgun";
import type { RequestHandler } from "./$types";

/**
 * Health check endpoint
 * Returns 200 if all critical services are healthy
 * Returns 503 if any critical service is unhealthy
 * - Database: always checked (critical)
 * - App customization singleton: always checked (critical)
 * - Email: checked if configured, skipped otherwise (non-critical in dev/CI)
 * Errors are logged server-side only and not exposed to clients
 */
export const GET: RequestHandler = async () => {
  let databaseConnected = false;
  let customizationConfigured = false;
  let emailStatus: "ok" | "not_configured" | "error" = "not_configured";

  // Check database connectivity and required singleton setup (critical)
  try {
    await db.execute(sql`SELECT 1 + 1 as result`);
    databaseConnected = true;

    const [customization] = await db
      .select({ id: table.appCustomization.id })
      .from(table.appCustomization)
      .where(eq(table.appCustomization.id, 1))
      .limit(1);

    customizationConfigured = !!customization;
  } catch (error) {
    console.error("[Health] Database check failed:", error);
  }

  // Check email service (Mailgun) connectivity (non-critical if not configured)
  try {
    emailStatus = await checkMailgunHealth();
  } catch (error) {
    console.error("[Health] Email check failed:", error);
    emailStatus = "error";
  }

  // Health check passes if:
  // - Database is connected and the required app customization singleton exists
  // - Email is either "ok" or "not_configured" (fails only on "error")
  const allHealthy = databaseConnected && customizationConfigured && emailStatus !== "error";

  return json(
    {
      status: allHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      database: databaseConnected ? "connected" : "disconnected",
      customization: customizationConfigured ? "configured" : "missing",
      email: emailStatus === "ok" ? "connected" : emailStatus === "not_configured" ? "not_configured" : "disconnected",
    },
    { status: allHealthy ? 200 : 503 },
  );
};
