import { error } from "@sveltejs/kit";
import type { RequestEvent } from "./$types";
import { getCustomizations } from "$lib/server/customization/cache";

const imageAssets = {
  "logo.svg": { field: "logo", contentType: "image/svg+xml; charset=utf-8", isSvg: true },
  "logo-dark.svg": { field: "logoDark", contentType: "image/svg+xml; charset=utf-8", isSvg: true },
  "favicon.png": { field: "favicon", contentType: "image/png", isSvg: false },
  "favicon-dark.png": { field: "faviconDark", contentType: "image/png", isSvg: false },
} as const;

type ImageAssetName = keyof typeof imageAssets;

function getImageAsset(filename: string) {
  return imageAssets[filename as ImageAssetName];
}

function isNotModified(request: Request, etag: string, updatedAt: Date) {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    const requestedEtags = new Set(ifNoneMatch.split(",").map((value) => value.trim()));
    return requestedEtags.has("*") || requestedEtags.has(etag);
  }

  const ifModifiedSince = request.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;

  const ifModifiedSinceTime = Date.parse(ifModifiedSince);
  if (Number.isNaN(ifModifiedSinceTime)) return false;

  return updatedAt.getTime() <= ifModifiedSinceTime;
}

export async function GET(event: RequestEvent) {
  const filename = event.params.filename;
  const asset = getImageAsset(filename);

  if (!asset) {
    return error(404, "Not found");
  }

  const customizations = await getCustomizations();
  const imageBuffer = customizations[asset.field];

  if (!imageBuffer) {
    return error(404, "Not found");
  }

  const updatedAt = customizations.updatedAt;
  const etag = `"app-customization-${asset.field}-${updatedAt.getTime()}"`;
  const headers: Record<string, string> = {
    "Content-Type": asset.contentType,
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
    "Last-Modified": updatedAt.toUTCString(),
  };

  if (asset.isSvg) {
    headers["Content-Security-Policy"] =
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; object-src 'none'; base-uri 'none'";
  }

  if (isNotModified(event.request, etag, updatedAt)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(imageBuffer as unknown as BodyInit, { headers });
}
