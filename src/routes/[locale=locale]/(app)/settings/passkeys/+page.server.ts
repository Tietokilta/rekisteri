import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getUserPasskeys } from "$lib/server/auth/passkey";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    return error(401, "Not authenticated");
  }

  const passkeys = await getUserPasskeys(locals.user.id);

  return {
    passkeys: passkeys.map((passkey) => ({
      id: passkey.id,
      deviceName: passkey.deviceName,
      backedUp: passkey.backedUp,
      transports: passkey.transports,
      createdAt: passkey.createdAt,
      lastUsedAt: passkey.lastUsedAt,
    })),
  };
};
