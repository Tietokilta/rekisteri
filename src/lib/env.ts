import { PUBLIC_URL, PUBLIC_GIT_COMMIT_SHA } from "$app/env/public";

/**
 * Validated and type-safe public environment variables (see src/env.ts).
 * Use this instead of importing from $app/env/public directly.
 * Can be imported on both client and server.
 *
 * @example
 * import { publicEnv } from "#lib/env.js";
 * const redirectUrl = `${publicEnv.PUBLIC_URL}/callback`;
 */
export const publicEnv = { PUBLIC_URL, PUBLIC_GIT_COMMIT_SHA };
