import type { RequestHandler } from "./$types";
import { getOidcProvider } from "$lib/server/oidc/provider";
import { handleOidcRequest } from "$lib/server/oidc/bridge";

export const GET: RequestHandler = async (event) => {
  const provider = getOidcProvider();
  return handleOidcRequest(event, provider);
};

export const POST: RequestHandler = async (event) => {
  const provider = getOidcProvider();
  return handleOidcRequest(event, provider);
};

export const OPTIONS: RequestHandler = async (event) => {
  const provider = getOidcProvider();
  return handleOidcRequest(event, provider);
};
