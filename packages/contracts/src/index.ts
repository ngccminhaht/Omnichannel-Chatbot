export type Provider = "facebook_page" | "zalo_oa";
export type MessageDirection = "inbound" | "outbound";
export type MessageType = "text" | "image" | "file" | "audio" | "video" | "unknown";

export interface CanonicalMessage {
  id: string;
  workspaceId: string;
  conversationId: string;
  channelConnectionId: string;
  direction: MessageDirection;
  senderType: "customer" | "agent" | "ai" | "system";
  messageType: MessageType;
  text?: string;
  externalMessageId?: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface CanonicalEvent<TPayload = unknown> {
  eventId: string;
  eventVersion: "2026-09-01";
  eventType: "message.received" | "message.sent" | "message.failed" | "conversation.updated" | "assignment.changed" | "handoff.changed";
  provider: Provider;
  workspaceId: string;
  connectionId: string;
  conversationId?: string;
  occurredAt: string;
  traceId: string;
  payload: TPayload;
}

export interface StoredWebhookEvent {
  provider: Provider;
  connectionId: string;
  externalEventId: string;
  receivedAt: string;
  payload: unknown;
}

export interface CanonicalInboundMessage {
  externalMessageId: string;
  externalAccountId: string;
  externalUserId: string;
  text?: string;
  messageType: MessageType;
  occurredAt: string;
  metadata: Record<string, unknown>;
}
