import { readFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";

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

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
