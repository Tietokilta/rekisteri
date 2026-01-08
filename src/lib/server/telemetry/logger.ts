import { logs } from "@opentelemetry/api-logs";
import { trace, type Span, SpanStatusCode } from "@opentelemetry/api";
import { currentLogLevel, LOG_LEVELS } from "../../../instrumentation.server.js";

const logger = logs.getLogger("rekisteri");

/**
 * Log levels matching OTEL severity
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Attributes that can be attached to logs
 */
export type LogAttributes = Record<string, string | number | boolean | undefined>;

/**
 * Get the current trace ID from the active span context
 */
function getTraceId(): string | undefined {
	const activeSpan = trace.getActiveSpan();
	if (activeSpan) {
		const spanContext = activeSpan.spanContext();
		return spanContext.traceId;
	}
	return undefined;
}

/**
 * Get the current span ID from the active span context
 */
function getSpanId(): string | undefined {
	const activeSpan = trace.getActiveSpan();
	if (activeSpan) {
		const spanContext = activeSpan.spanContext();
		return spanContext.spanId;
	}
	return undefined;
}

/**
 * Internal log function that emits structured logs
 */
function log(level: LogLevel, message: string, attributes?: LogAttributes): void {
	// Check if this log level should be emitted
	const levelValue = LOG_LEVELS[level];
	if (levelValue < currentLogLevel) {
		return;
	}

	// Add trace context if available
	const enrichedAttributes: LogAttributes = {
		...attributes,
		traceId: getTraceId(),
		spanId: getSpanId(),
		timestamp: new Date().toISOString(),
	};

	// Emit log record
	logger.emit({
		severityText: level.toUpperCase(),
		body: message,
		attributes: enrichedAttributes,
	});
}

/**
 * Structured logger with trace correlation
 */
export const telemetryLogger = {
	/**
	 * Log a debug message (only in development)
	 */
	debug(message: string, attributes?: LogAttributes): void {
		log("debug", message, attributes);
	},

	/**
	 * Log an informational message
	 */
	info(message: string, attributes?: LogAttributes): void {
		log("info", message, attributes);
	},

	/**
	 * Log a warning message
	 */
	warn(message: string, attributes?: LogAttributes): void {
		log("warn", message, attributes);
	},

	/**
	 * Log an error message
	 */
	error(message: string, error?: Error | unknown, attributes?: LogAttributes): void {
		const errorAttributes = {
			...attributes,
		};

		if (error instanceof Error) {
			errorAttributes.errorName = error.name;
			errorAttributes.errorMessage = error.message;
			errorAttributes.errorStack = error.stack;
		} else if (error) {
			errorAttributes.error = String(error);
		}

		log("error", message, errorAttributes);
	},

	/**
	 * Create a child span for tracing operations
	 */
	startSpan<T>(name: string, fn: (span: Span) => Promise<T>, attributes?: LogAttributes): Promise<T> {
		const tracer = trace.getTracer("rekisteri");
		return tracer.startActiveSpan(name, { attributes }, async (span: Span) => {
			try {
				const result = await fn(span);
				span.setStatus({ code: SpanStatusCode.OK });
				return result;
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR });
				throw error;
			} finally {
				span.end();
			}
		});
	},

	/**
	 * Get current trace ID for display to users
	 */
	getTraceId,

	/**
	 * Get current span ID
	 */
	getSpanId,
};
