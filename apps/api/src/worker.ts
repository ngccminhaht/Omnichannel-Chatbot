import { query, withTransaction } from "./db.js";
import { getChannelProvider } from "./provider.js";
import { decryptJson } from "./credential-vault.js";

type OutboxRow = {
  id: string;
  workspace_id: string;
  aggregate_id: string;
  payload: { message_id: string; connection_id: string; recipient_external_id: string; text: string };
  attempts: number;
};

async function claimNext(): Promise<OutboxRow | null> {
  return withTransaction(async (client) => {
    const result = await client.query<OutboxRow>(
      `UPDATE outbox_events SET status = 'sending', locked_at = now(), attempts = attempts + 1
       WHERE id = (
         SELECT id FROM outbox_events
         WHERE event_type = 'message.send.requested'
           AND published_at IS NULL
           AND status = 'queued'
           AND available_at <= now()
           AND (locked_at IS NULL OR locked_at < now() - interval '2 minutes')
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       RETURNING id, workspace_id, aggregate_id, payload, attempts`,
    );
    return result.rows[0] ?? null;
  });
}

async function deliver(row: OutboxRow) {
  try {
    const connection = await query<{ provider: string; external_account_id: string; encrypted_credentials: Buffer }>("SELECT provider, external_account_id, encrypted_credentials FROM channel_connections WHERE id = $1", [row.payload.connection_id]);
    const connectionRow = connection.rows[0];
    if (!connectionRow) throw new Error("CHANNEL_CONNECTION_NOT_FOUND");
    const credentials = decryptJson<{ accessToken?: string }>(connectionRow.encrypted_credentials);
    const provider = getChannelProvider();
    const result = await provider.sendText({
      provider: connectionRow.provider,
      connectionId: row.payload.connection_id,
      recipientExternalId: row.payload.recipient_external_id,
      text: row.payload.text,
      pageId: connectionRow.external_account_id,
      ...(credentials.accessToken ? { accessToken: credentials.accessToken } : {}),
    });
    await query(
      `UPDATE messages SET status = 'sent', metadata = metadata || $2::jsonb
       WHERE id = $1`,
      [row.payload.message_id, JSON.stringify({ provider_message_id: result.providerMessageId, delivery: result.metadata })],
    );
    await query(
      `UPDATE outbox_events SET status = 'sent', published_at = now(), locked_at = NULL WHERE id = $1`,
      [row.id],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_DELIVERY_ERROR";
    await query(
      `UPDATE outbox_events
       SET status = CASE WHEN attempts >= 5 THEN 'dead_letter' ELSE 'queued' END,
           locked_at = NULL, last_error = $2,
           available_at = now() + CASE WHEN attempts >= 5 THEN interval '0 seconds' ELSE interval '30 seconds' END
       WHERE id = $1`,
      [row.id, message],
    );
    await query("UPDATE messages SET status = CASE WHEN $2::integer >= 5 THEN 'failed' ELSE 'queued' END WHERE id = $1", [row.payload.message_id, row.attempts]);
  }
}

async function run() {
  console.log("chat2-worker started");
  while (true) {
    const row = await claimNext();
    if (row) await deliver(row);
    else await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
