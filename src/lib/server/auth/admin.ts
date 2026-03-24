import {
  hasAdminAccess as _hasAdminAccess,
  hasAdminWriteAccess as _hasAdminWriteAccess,
  isReadOnlyAdmin as _isReadOnlyAdmin,
  type AdminRole,
} from "$lib/shared/enums";

type UserWithAdminRole = { adminRole: AdminRole } | null | undefined;

/**
 * Null-safe wrapper: check if a user has any admin access (readonly or admin).
 * Use this in server code where the user may be null/undefined.
 */
export function hasAdminAccess(user: UserWithAdminRole): boolean {
  return user != null && _hasAdminAccess(user.adminRole);
}

/**
 * Null-safe wrapper: check if a user has full admin write access.
 * Use this in server code where the user may be null/undefined.
 */
export function hasAdminWriteAccess(user: UserWithAdminRole): boolean {
  return user != null && _hasAdminWriteAccess(user.adminRole);
}

/**
 * Null-safe wrapper: check if a user is a read-only admin.
 * Use this in server code where the user may be null/undefined.
 */
export function isReadOnlyAdmin(user: UserWithAdminRole): boolean {
  return user != null && _isReadOnlyAdmin(user.adminRole);
}
