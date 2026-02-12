# Telemetry & Logging

This document describes the telemetry and logging implementation in the rekisteri application.

## Overview

The application uses **OpenTelemetry (OTEL)** for structured logging and distributed tracing. This provides comprehensive observability while maintaining user privacy.

## Architecture

### Components

1. **`src/instrumentation.server.ts`**: OTEL SDK initialization
   - Sets up trace and log exporters
   - Configures auto-instrumentation for HTTP requests
   - Runs before application code (guaranteed by SvelteKit)

2. **`src/lib/server/telemetry/`**: Telemetry helper library
   - Structured logger with trace correlation
   - Custom span creation utilities
   - Privacy-safe logging patterns

3. **SvelteKit Built-in Tracing**: Automatic spans for:
   - `handle` hooks
   - `load` functions
   - Form actions
   - Remote functions

### How It Works

```
Request → SvelteKit Span → Custom Spans → Structured Logs
                ↓
          Trace ID generated
                ↓
          Added to event.locals
                ↓
          Shown in error page (5xx only)
```

## Privacy & GDPR Compliance

### What We Log

✅ **Safe to log:**

- Request IDs (generated UUIDs)
- User IDs (already UUIDs, non-PII)
- Session IDs (hashed)
- Stripe IDs (session, customer, event IDs)
- HTTP methods, paths, status codes
- Error messages and stack traces
- Business metrics (membership types, statuses)
- Timing data

❌ **Never logged:**

- Email addresses (except domain in some cases)
- Full names
- IP addresses (or masked)
- Payment details beyond Stripe IDs
- Session tokens (only hashed IDs)

### Retention

- **Default**: 7 days (Azure App Service default for filesystem logs)
- **Configurable**: Can be extended in Azure Log Analytics
- **Audit logs**: 90 days (separate retention policy)

### Privacy Policy Addition

The following text should be added to your privacy policy:

> **Server Logs**
>
> We collect server logs for debugging and security purposes. These logs include request identifiers, session identifiers (hashed), and technical information about your usage. Logs are retained for **7 days** and do not contain personally identifiable information such as your email address or name.

## Usage

### Structured Logging

```typescript
import { logger } from "$lib/server/telemetry";

// Info log
logger.info("stripe.webhook.received", {
  "stripe.event.id": eventId,
  "stripe.event.type": eventType,
});

// Warning log
logger.warn("stripe.webhook.duplicate", {
  "stripe.event.id": eventId,
});

// Error log
logger.error("stripe.webhook.failed", error, {
  "stripe.event.id": eventId,
  "user.id": userId,
});
```

### Custom Spans

```typescript
import { logger } from "$lib/server/telemetry";

await logger.startSpan("stripe.checkout.create", async (span) => {
  span.setAttribute("user.id", userId);
  span.setAttribute("membership.id", membershipId);

  const session = await createCheckoutSession();

  span.setAttribute("stripe.session.id", session.id);
  return session;
});
```

### Augmenting SvelteKit Spans

```typescript
export const load: PageServerLoad = async ({ locals, tracing }) => {
  // SvelteKit automatically creates a span for this load function
  // Augment it with business context
  tracing?.current.setAttribute("user.id", locals.user?.id);

  const data = await fetchData();
  return data;
};
```

## Environment Variables

```bash
# Support email shown in error messages
PUBLIC_SUPPORT_EMAIL="hallitus@tietokilta.fi"

# Log level: debug | info | warn | error
OTEL_LOG_LEVEL="info"
```

## Development vs Production

### Development

- Pretty-printed logs to console
- All log levels enabled
- Trace IDs shown in formatted output

### Production

- JSON logs to stdout (captured by Azure)
- Respects `OTEL_LOG_LEVEL`
- Logs available in Azure Portal → Log stream

## Error Handling

When a 5xx error occurs:

1. Error is logged with full context
2. Trace ID is captured
3. User sees error page with trace ID
4. User can contact support with the trace ID
5. Support can search logs by trace ID

## Future: Azure Monitor Integration

To enable full distributed tracing with Azure Monitor:

1. Install Azure Monitor exporter:

   ```bash
   pnpm add @azure/monitor-opentelemetry-exporter
   ```

2. Update `src/instrumentation.server.ts`:

   ```typescript
   import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";

   const traceExporter = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
     ? new AzureMonitorTraceExporter()
     : new PrettyConsoleSpanExporter();
   ```

3. Set environment variable:
   ```bash
   APPLICATIONINSIGHTS_CONNECTION_STRING="..."
   ```

## Debugging

### View Logs Locally

Development server shows pretty-printed logs:

```
┌─ [INFO] stripe.webhook.received
├─ traceId: abc123...
├─ stripe.event.id: evt_xxx
└─ stripe.event.type: checkout.session.completed
```

### View Logs in Production

1. Azure Portal → App Service → Log stream
2. Or download: `https://tik-registry-prod.scm.azurewebsites.net/api/vfs/LogFiles/`
3. Search by trace ID to find all related logs

### Query Examples

If using Azure Log Analytics:

```kusto
// Find all logs for a specific trace ID
traces
| where customDimensions.traceId == "abc123..."
| order by timestamp desc

// Find all errors in the last 24 hours
traces
| where timestamp > ago(24h)
| where severityLevel >= 3  // Error level
| summarize count() by tostring(customDimensions.errorName)
```

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [SvelteKit Observability](https://svelte.dev/docs/kit/observability)
- [Wide Events Blog](https://loggingsucks.com/)
