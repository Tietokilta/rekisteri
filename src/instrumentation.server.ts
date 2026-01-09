import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { ConsoleLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { logs } from "@opentelemetry/api-logs";
import { createAddHookMessageChannel } from "import-in-the-middle";
import { register } from "node:module";

// Required for import-in-the-middle to work with ESM
const { registerOptions } = createAddHookMessageChannel();
register("import-in-the-middle/hook.mjs", import.meta.url, registerOptions);

// Determine environment
// eslint-disable-next-line no-restricted-syntax
const isDev = process.env.NODE_ENV !== "production";
// eslint-disable-next-line no-restricted-syntax
const logLevel = process.env.OTEL_LOG_LEVEL || "info";

// Map log level to numeric value
const LOG_LEVELS = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
} as const;

const currentLogLevel = LOG_LEVELS[logLevel as keyof typeof LOG_LEVELS] ?? LOG_LEVELS.info;

// Custom console exporter for pretty-printing in dev
class PrettyConsoleSpanExporter extends ConsoleSpanExporter {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export(spans: any[], resultCallback: (result: any) => void): void {
		if (isDev) {
			// Pretty print for development
			for (const span of spans) {
				const duration = (span.duration[0] * 1000 + span.duration[1] / 1_000_000).toFixed(2);
				console.log(`┌─ [TRACE] ${span.name}`);
				console.log(`├─ traceId: ${span.spanContext.traceId}`);
				console.log(`├─ spanId: ${span.spanContext.spanId}`);
				console.log(`├─ duration: ${duration}ms`);
				if (span.attributes && Object.keys(span.attributes).length > 0) {
					console.log(`├─ attributes:`);
					for (const [key, value] of Object.entries(span.attributes)) {
						console.log(`│  ├─ ${key}: ${value}`);
					}
				}
				console.log(`└─`);
			}
			resultCallback({ code: 0 });
		} else {
			// JSON output for production
			super.export(spans, resultCallback);
		}
	}
}

// Custom console log exporter for pretty-printing in dev
class PrettyConsoleLogRecordExporter extends ConsoleLogRecordExporter {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export(logs: any[], resultCallback: (result: any) => void): void {
		if (isDev) {
			// Pretty print for development
			for (const log of logs) {
				const level = log.severityText || "INFO";
				const body = typeof log.body === "string" ? log.body : JSON.stringify(log.body);
				console.log(`┌─ [${level}] ${body}`);
				if (log.attributes && Object.keys(log.attributes).length > 0) {
					for (const [key, value] of Object.entries(log.attributes)) {
						console.log(`├─ ${key}: ${value}`);
					}
				}
				console.log(`└─`);
			}
			resultCallback({ code: 0 });
		} else {
			// JSON output for production
			super.export(logs, resultCallback);
		}
	}
}

// Initialize OTEL SDK
const sdk = new NodeSDK({
	serviceName: "rekisteri",
	traceExporter: new PrettyConsoleSpanExporter(),
	instrumentations: [
		getNodeAutoInstrumentations({
			// Auto-instrument HTTP requests
			"@opentelemetry/instrumentation-http": {},
			// Disable instrumentations we don't need
			"@opentelemetry/instrumentation-fs": { enabled: false },
			"@opentelemetry/instrumentation-net": { enabled: false },
			"@opentelemetry/instrumentation-dns": { enabled: false },
		}),
	],
});

// Initialize log provider
const loggerProvider = new LoggerProvider();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(loggerProvider as any).addLogRecordProcessor(new SimpleLogRecordProcessor(new PrettyConsoleLogRecordExporter()));
logs.setGlobalLoggerProvider(loggerProvider);

// Start the SDK
sdk.start();

// Graceful shutdown
process.on("SIGTERM", () => {
	sdk
		.shutdown()
		.then(() => console.log("OpenTelemetry SDK shut down successfully"))
		.catch((error) => console.error("Error shutting down OpenTelemetry SDK", error))
		.finally(() => process.exit(0));
});

// Export current log level for use in logger
export { currentLogLevel, LOG_LEVELS };
