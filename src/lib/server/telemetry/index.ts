/**
 * Telemetry module for structured logging and distributed tracing
 *
 * This module provides:
 * - Structured logging with trace correlation
 * - Custom span creation for detailed operation tracking
 * - Integration with SvelteKit's built-in OpenTelemetry support
 *
 * Privacy considerations:
 * - Only log UUIDs (user IDs, session IDs, request IDs)
 * - Never log PII (emails, names, IP addresses)
 * - Hash or redact sensitive data before logging
 *
 * Usage:
 * ```typescript
 * import { logger } from '$lib/server/telemetry';
 *
 * logger.info('stripe.webhook.received', {
 *   'stripe.event.id': eventId,
 *   'stripe.event.type': eventType,
 * });
 *
 * await logger.startSpan('db.transaction.fulfill', async (span) => {
 *   const result = await db.transaction(...);
 *   span.setAttribute('member.id', result.id);
 *   return result;
 * });
 * ```
 */

export { telemetryLogger as logger } from "./logger.js";
export type { LogLevel, LogAttributes } from "./logger.js";
