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
					process.env[key.trim()] = value.trim();
				}
			}
		}
	} catch (e) {
		console.warn("Could not load .env file:", e);
	}
}
