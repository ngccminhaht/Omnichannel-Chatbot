export interface ProviderSendRequest {
  provider: string;
  connectionId: string;
  recipientExternalId: string;
  text: string;
  pageId?: string;
  accessToken?: string;
}

export interface ProviderSendResult {
  providerMessageId: string;
  status: "sent";
  metadata: Record<string, unknown>;
}

export interface ChannelProvider {
  sendText(request: ProviderSendRequest): Promise<ProviderSendResult>;
}

export class FacebookChannelProvider implements ChannelProvider {
  async sendText(request: ProviderSendRequest): Promise<ProviderSendResult> {
    if (!request.pageId || !request.accessToken) throw new Error("FACEBOOK_CREDENTIALS_MISSING");
    const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";
    const response = await fetch(`https://graph.facebook.com/${version}/${request.pageId}/messages?access_token=${encodeURIComponent(request.accessToken)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: request.recipientExternalId }, message: { text: request.text } }),
    });
    const body = await response.json() as { message_id?: string; error?: { message?: string; code?: number } };
    if (!response.ok || body.error || !body.message_id) throw new Error(`META_SEND_ERROR:${body.error?.code ?? response.status}:${body.error?.message ?? "provider rejected message"}`);
    return { providerMessageId: body.message_id, status: "sent", metadata: { provider: "facebook_page" } };
  }
}

export function getChannelProvider(): ChannelProvider {
  return new FacebookChannelProvider();
}
