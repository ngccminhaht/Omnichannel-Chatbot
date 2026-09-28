import type { CanonicalInboundMessage } from "@chat2/contracts";
import { z } from "zod";

const attachmentSchema = z.object({
  type: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

const messageSchema = z.object({
  mid: z.string().optional(),
  text: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const webhookSchema = z.object({
  object: z.literal("page"),
  entry: z.array(z.object({
    id: z.string(),
    time: z.number().optional(),
    messaging: z.array(z.object({
      sender: z.object({ id: z.string() }),
      recipient: z.object({ id: z.string() }),
      timestamp: z.number().optional(),
      message: messageSchema.optional(),
    })).optional(),
  })),
});

export function normalizeFacebookMessages(payload: unknown): CanonicalInboundMessage[] {
  const parsed = webhookSchema.parse(payload);
  const messages: CanonicalInboundMessage[] = [];

  for (const entry of parsed.entry) {
    for (const event of entry.messaging ?? []) {
      if (!event.message) continue;
      const occurredAt = new Date(event.timestamp ?? entry.time ?? Date.now()).toISOString();
      const attachments = event.message.attachments ?? [];
      const messageType = event.message.text
        ? "text"
        : attachments[0]?.type === "image"
          ? "image"
          : attachments[0]?.type === "video"
            ? "video"
            : attachments[0]?.type === "audio"
              ? "audio"
              : attachments.length > 0
                ? "file"
                : "unknown";

      messages.push({
        externalMessageId: event.message.mid ?? `${event.sender.id}:${event.timestamp ?? entry.time ?? Date.now()}`,
        externalAccountId: event.recipient.id,
        externalUserId: event.sender.id,
        ...(event.message.text ? { text: event.message.text } : {}),
        messageType,
        occurredAt,
        metadata: { provider: "facebook_page", attachments },
      });
    }
  }

  return messages;
}
