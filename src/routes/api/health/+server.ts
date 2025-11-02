import { db } from "$lib/server/db";
import { sql } from "drizzle-orm";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Health check endpoint
 * Returns 200 if the service is healthy and can connect to the database
 * Returns 503 if the service is unhealthy
 */
export const GET: RequestHandler = async () => {
	try {
		// Simple database query to verify connectivity
		await db.execute(sql`SELECT 1 + 1 as result`);

		return json(
			{
				status: "healthy",
				timestamp: new Date().toISOString(),
				database: "connected",
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error("Health check failed:", error);

		return json(
			{
				status: "unhealthy",
				timestamp: new Date().toISOString(),
				database: "disconnected",
			},
			{ status: 503 },
		);
	}
};
