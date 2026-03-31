import type { User } from "$lib/server/db/schema";

/**
 * Convert user's preferred language to locale code
 * @param user - The user object
 * @returns Locale code ('fi' or 'en'), defaults to 'fi' for unspecified
 */
export function getUserLocale(user: Pick<User, "preferredLanguage">): "fi" | "en" {
  return user.preferredLanguage === "english" ? "en" : "fi";
}
