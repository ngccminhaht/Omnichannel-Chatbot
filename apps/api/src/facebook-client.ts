import { decryptJson } from "./credential-vault.js";

type FacebookPage = { id: string; name: string; access_token: string; tasks?: string[] };
type FacebookToken = { access_token: string; token_type?: string; expires_in?: number };

const graphVersion = () => process.env.META_GRAPH_API_VERSION ?? "v26.0";
const graphUrl = (path: string) => `https://graph.facebook.com/${graphVersion()}${path}`;

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json() as T & { error?: { message?: string; code?: number } };
  if (!response.ok || body.error) throw new Error(`META_API_ERROR:${body.error?.code ?? response.status}:${body.error?.message ?? "request failed"}`);
  return body;
}

export async function exchangeCode(code: string): Promise<FacebookToken> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: process.env.META_REDIRECT_URI ?? "",
    code,
  });
  return jsonRequest<FacebookToken>(`${graphUrl("/oauth/access_token")}?${params}`);
}

export async function listPages(userAccessToken: string): Promise<FacebookPage[]> {
  const params = new URLSearchParams({ fields: "id,name,access_token,tasks", access_token: userAccessToken });
  const result = await jsonRequest<{ data: FacebookPage[] }>(`${graphUrl("/me/accounts")}?${params}`);
  return result.data;
}

export async function subscribePage(page: FacebookPage): Promise<void> {
  const params = new URLSearchParams({
    subscribed_fields: "messages,messaging_postbacks,message_deliveries,message_reads",
    access_token: page.access_token,
  });
  await jsonRequest(`${graphUrl(`/${page.id}/subscribed_apps`)}?${params}`, { method: "POST" });
}

export async function unsubscribePage(pageId: string, encryptedCredentials: Buffer): Promise<void> {
  const credentials = decryptJson<{ accessToken: string }> (encryptedCredentials);
  const params = new URLSearchParams({ access_token: credentials.accessToken });
  await jsonRequest(`${graphUrl(`/${pageId}/subscribed_apps`)}?${params}`, { method: "DELETE" });
}

export async function checkPage(pageId: string, encryptedCredentials: Buffer): Promise<{ id: string; name?: string }> {
  const credentials = decryptJson<{ accessToken: string }>(encryptedCredentials);
  const params = new URLSearchParams({ fields: "id,name", access_token: credentials.accessToken });
  return jsonRequest(`${graphUrl(`/${pageId}`)}?${params}`);
}
