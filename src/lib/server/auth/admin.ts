import type { AdminRole } from "$lib/shared/enums";

type UserWithAdminRole = { adminRole: AdminRole } | null | undefined;

/**
 * Check if a user has any admin access (readonly or admin).
 * Use this for checking access to admin pages and read-only operations.
 */
export function hasAdminAccess(user: UserWithAdminRole): boolean {
  return user?.adminRole === "readonly" || user?.adminRole === "admin";
}

/**
 * Check if a user has full admin write access.
 * Use this for checking access to write operations (create, update, delete).
 */
export function hasAdminWriteAccess(user: UserWithAdminRole): boolean {
  return user?.adminRole === "admin";
}

/**
 * Check if a user is a read-only admin (can view but not modify).
 */
export function isReadOnlyAdmin(user: UserWithAdminRole): boolean {
  return user?.adminRole === "readonly";
}
