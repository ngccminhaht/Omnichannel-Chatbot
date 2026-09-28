import type { StoredWebhookEvent } from "@chat2/contracts";
import type { CanonicalInboundMessage } from "@chat2/contracts";
import { pool, withTransaction } from "./db.js";
import { normalizeFacebookMessages } from "./facebook-adapter.js";

export interface WebhookStore {
  insertIfNew(event: StoredWebhookEvent): Promise<boolean>;
}

/** Temporary adapter for the first vertical slice. Replace with PostgreSQL in the next commit. */
export class MemoryWebhookStore implements WebhookStore {
  private readonly ids = new Set<string>();

  async insertIfNew(event: StoredWebhookEvent): Promise<boolean> {
    const key = `${event.provider}:${event.connectionId}:${event.externalEventId}`;
    if (this.ids.has(key)) return false;
    this.ids.add(key);
    return true;
  }
}

export class PostgresWebhookStore implements WebhookStore {
  async insertIfNew(event: StoredWebhookEvent): Promise<boolean> {
    if (!pool) throw new Error("DATABASE_URL is not configured");
    const result = await pool.query(
      `INSERT INTO webhook_events(provider, connection_id, external_event_id, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider, connection_id, external_event_id) DO NOTHING`,
      [event.provider, event.connectionId, event.externalEventId, event.payload],
    );
    return result.rowCount === 1;
  }

  async ingestFacebook(event: StoredWebhookEvent): Promise<{ inserted: boolean; messageCount: number }> {
    if (!pool) throw new Error("DATABASE_URL is not configured");
    return withTransaction(async (client) => {
      const webhook = await client.query<{ id: string }>(
        `INSERT INTO webhook_events(provider, connection_id, external_event_id, payload)
         SELECT $1, id, $3, $4
         FROM channel_connections
         WHERE id = $2 AND provider = 'facebook_page' AND status = 'active'
         ON CONFLICT (provider, connection_id, external_event_id) DO NOTHING
         RETURNING id`,
        [event.provider, event.connectionId, event.externalEventId, event.payload],
      );

      if (!webhook.rowCount) return { inserted: false, messageCount: 0 };
      const webhookRow = webhook.rows[0];
      if (!webhookRow) return { inserted: false, messageCount: 0 };
      const connectionResult = await client.query<{ workspace_id: string; external_account_id: string }>(
        `SELECT workspace_id, external_account_id FROM channel_connections WHERE id = $1`,
        [event.connectionId],
      );
      const connection = connectionResult.rows[0];
      if (!connection) throw new Error("Channel connection not found");
      const messages = normalizeFacebookMessages(event.payload);
      let messageCount = 0;

      for (const message of messages) {
        if (message.externalAccountId !== connection.external_account_id) continue;
        const contactId = await findOrCreateContact(client, connection.workspace_id, event.connectionId, message);
        const conversation = await client.query<{ id: string }>(
          `INSERT INTO conversations(workspace_id, contact_id, connection_id, last_message_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (connection_id, contact_id) WHERE state <> 'closed' AND state <> 'spam'
           DO UPDATE SET last_message_at = GREATEST(conversations.last_message_at, EXCLUDED.last_message_at), updated_at = now(), version = conversations.version + 1
           RETURNING id`,
          [connection.workspace_id, contactId, event.connectionId, message.occurredAt],
        );
        const conversationId = conversation.rows[0]?.id;
        if (!conversationId) continue;

        const stored = await client.query<{ id: string }>(
          `INSERT INTO messages(workspace_id, conversation_id, connection_id, direction, sender_type, message_type, text, external_message_id, status, occurred_at, metadata)
           VALUES ($1, $2, $3, 'inbound', 'customer', $4, $5, $6, 'received', $7, $8)
           ON CONFLICT (connection_id, external_message_id) DO NOTHING
           RETURNING id`,
          [connection.workspace_id, conversationId, event.connectionId, message.messageType, message.text ?? null, message.externalMessageId, message.occurredAt, message.metadata],
        );
        const messageId = stored.rows[0]?.id;
        if (!messageId) continue;
        messageCount += 1;

        await client.query(
          `UPDATE conversations SET last_message_at = $2, unread_count = unread_count + 1, updated_at = now(), version = version + 1 WHERE id = $1`,
          [conversationId, message.occurredAt],
        );
        const canonical = {
          event_id: messageId,
          event_type: "message.received",
          event_version: "2026-09-01",
          provider: "facebook_page",
          workspace_id: connection.workspace_id,
          connection_id: event.connectionId,
          conversation_id: conversationId,
          occurred_at: message.occurredAt,
          payload: message,
        };
        await client.query(
          `INSERT INTO outbox_events(workspace_id, event_type, aggregate_type, aggregate_id, payload)
           VALUES ($1, 'message.received', 'conversation', $2, $3)`,
          [connection.workspace_id, conversationId, canonical],
        );
      }

      await client.query(`UPDATE webhook_events SET processed_at = now() WHERE id = $1`, [webhookRow.id]);
      return { inserted: true, messageCount };
    });
  }
}

async function findOrCreateContact(client: import("pg").PoolClient, workspaceId: string, connectionId: string, message: CanonicalInboundMessage): Promise<string> {
  const existing = await client.query<{ contact_id: string }>(
    `SELECT contact_id FROM contact_identities WHERE connection_id = $1 AND external_user_id = $2 FOR UPDATE`,
    [connectionId, message.externalUserId],
  );
  if (existing.rows[0]) return existing.rows[0].contact_id;

  const contact = await client.query<{ id: string }>(
    `INSERT INTO contacts(workspace_id, display_name, metadata) VALUES ($1, $2, $3) RETURNING id`,
    [workspaceId, message.externalUserId, { provider: "facebook_page" }],
  );
  const createdContact = contact.rows[0];
  if (!createdContact) throw new Error("Failed to create contact");
  await client.query(
    `INSERT INTO contact_identities(workspace_id, contact_id, provider, connection_id, external_user_id) VALUES ($1, $2, 'facebook_page', $3, $4)`,
    [workspaceId, createdContact.id, connectionId, message.externalUserId],
  );
  return createdContact.id;
}
