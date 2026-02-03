import { db } from "$lib/server/db";
import { sql } from "drizzle-orm";
import { json } from "@sveltejs/kit";
import { checkMailgunHealth } from "$lib/server/mailgun";
import type { RequestHandler } from "./$types";

/**
 * Health check endpoint
 * Returns 200 if all critical services are healthy
 * Returns 503 if any critical service is unhealthy
 * - Database: always checked (critical)
 * - Email: checked if configured, skipped otherwise (non-critical in dev/CI)
 * Errors are logged server-side only and not exposed to clients
 */
export const GET: RequestHandler = async () => {
  let databaseHealthy = false;
  let emailStatus: "ok" | "not_configured" | "error" = "not_configured";

  // Check database connectivity (critical)
  try {
    await db.execute(sql`SELECT 1 + 1 as result`);
    databaseHealthy = true;
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
  // - Database is healthy (required)
  // - Email is either "ok" or "not_configured" (fails only on "error")
  const allHealthy = databaseHealthy && emailStatus !== "error";

  return json(
    {
      status: allHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      database: databaseHealthy ? "connected" : "disconnected",
      email: emailStatus === "ok" ? "connected" : emailStatus === "not_configured" ? "not_configured" : "disconnected",
    },
    { status: allHealthy ? 200 : 503 },
  );
};
