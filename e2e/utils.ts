import { readFileSync } from "node:fs";

export function loadEnvFile() {
  try {
    const envFile = readFileSync(".env", "utf8");
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=").replaceAll(/^["']|["']$/g, "");
        if (key && value) {
          const trimmedKey = key.trim();
          // Don't overwrite existing env vars (CI secrets take precedence)
          if (!process.env[trimmedKey]) {
            process.env[trimmedKey] = value.trim();
          }
        }
      }
    }
  } catch (e) {
    console.warn("Could not load .env file:", e);
  }
}

// Re-export testcontainer utilities for convenience
export { getDatabaseUrl, loadContainerState } from "./testcontainer";
