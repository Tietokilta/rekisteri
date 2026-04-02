import { error } from "@sveltejs/kit";
import type { RequestEvent } from "./$types";
import { getCustomizations } from "$lib/server/customization/cache";

export async function GET(event: RequestEvent) {
  const type = event.params.type;

  // Validate type is one of the allowed image fields
  if (!["logo", "logoDark", "favicon", "faviconDark"].includes(type)) {
    return error(404, "Not found");
  }

  const customizations = await getCustomizations();
  if (!customizations) {
    return error(404, "Not found");
  }

  const imageBuffer = customizations[type as "logo" | "logoDark" | "favicon" | "faviconDark"];

  if (!imageBuffer) {
    return error(404, "Not found");
  }

  // Logos are SVGs, favicons are PNGs
  const contentType = type.startsWith("favicon") ? "image/png" : "image/svg+xml";

  return new Response(imageBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      // Cache extremely aggressively since we use generic cache buster queries in the UI (?v=timestamp)
      // Browsers will always use this cached version unless the query timestamp changes
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
