import Fastify from "fastify";
import sensible from "@fastify/sensible";
import rawBody from "fastify-raw-body";
import { randomBytes, randomUUID } from "node:crypto";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";
import { z } from "zod";
import { MemoryWebhookStore, PostgresWebhookStore } from "./webhook-store.js";
import { requireWorkspaceContext } from "./auth.js";
import { query, withTransaction } from "./db.js";
import { encryptJson } from "./credential-vault.js";
import { checkPage, exchangeCode, listPages, subscribePage, unsubscribePage } from "./facebook-client.js";

const app = Fastify({ logger: true });
await app.register(sensible);
await app.register(rawBody, { field: "rawBody", global: false, routes: ["/webhooks/facebook", "/webhooks/facebook/:connectionId"] });

const store = process.env.DATABASE_URL ? new PostgresWebhookStore() : new MemoryWebhookStore();
const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "change-me";
const appSecret = process.env.META_APP_SECRET ?? "";

function hasValidMetaSignature(signature: string | undefined, rawBody: Buffer | undefined): boolean {
  if (!signature || !rawBody || !appSecret) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

app.get("/health", async () => ({ status: "ok", service: "chat2-api" }));

app.get<{ Params: { workspaceId: string } }>("/api/v1/workspaces/:workspaceId/channels", async (request, reply) => {
  try {
    await requireWorkspaceContext(request, request.params.workspaceId, "workspace:read");
    const result = await query(
      `SELECT id, provider, external_account_id, external_account_name, status, webhook_status, last_sync_at, metadata, created_at, updated_at
       FROM channel_connections WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [request.params.workspaceId],
    );
    return { data: result.rows };
  } catch (error) {
    return reply.code(error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 403).send({ error: { code: error instanceof Error ? error.message : "ACCESS_DENIED" } });
  }
});

app.get<{ Params: { workspaceId: string } }>("/api/v1/workspaces/:workspaceId/channels/facebook_page/oauth/start", async (request, reply) => {
  try {
    const context = await requireWorkspaceContext(request, request.params.workspaceId, "channel:manage");
    const appId = process.env.META_APP_ID;
    const redirectUri = process.env.META_REDIRECT_URI;
    if (!appId || !redirectUri || appId === "your-meta-app-id") return reply.code(503).send({ error: { code: "META_OAUTH_NOT_CONFIGURED" } });
    const state = randomBytes(32).toString("hex");
    const stateHash = createHash("sha256").update(state).digest("hex");
    await query(
      `INSERT INTO oauth_sessions(provider, workspace_id, user_id, state_hash, redirect_uri, expires_at)
       VALUES ('facebook_page', $1, $2, $3, $4, now() + interval '10 minutes')`,
      [request.params.workspaceId, context.userId, stateHash, redirectUri],
    );
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: process.env.META_OAUTH_SCOPES ?? "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging",
    });
    return { authorization_url: `https://www.facebook.com/${process.env.META_GRAPH_API_VERSION ?? "v26.0"}/dialog/oauth?${params}` };
  } catch (error) {
    return reply.code(error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 403).send({ error: { code: error instanceof Error ? error.message : "OAUTH_START_FAILED" } });
  }
});

app.get<{ Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>("/api/v1/oauth/facebook_page/callback", async (request, reply) => {
  if (request.query.error) return reply.code(400).send({ error: { code: "META_OAUTH_DENIED", message: request.query.error_description ?? request.query.error } });
  if (!request.query.code || !request.query.state) return reply.badRequest("code and state are required");
  const stateHash = createHash("sha256").update(request.query.state).digest("hex");
  const session = await query<{ id: string; workspace_id: string; user_id: string }>(
    `UPDATE oauth_sessions SET used_at = now() WHERE state_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING id, workspace_id, user_id`,
    [stateHash],
  );
  const oauthSession = session.rows[0];
  if (!oauthSession) return reply.code(400).send({ error: { code: "OAUTH_STATE_INVALID" } });

  try {
    const userToken = await exchangeCode(request.query.code);
    const pages = await listPages(userToken.access_token);
    const connected: Array<{ id: string; page_id: string; name: string; webhook_status: string }> = [];
    for (const page of pages) {
      try {
        await subscribePage(page);
        const credentials = encryptJson({ accessToken: page.access_token, pageId: page.id, connectedAt: new Date().toISOString() });
        const connection = await query<{ id: string }>(
          `INSERT INTO channel_connections(workspace_id, provider, external_account_id, external_account_name, status, encrypted_credentials, webhook_status, metadata, last_sync_at)
           VALUES ($1, 'facebook_page', $2, $3, 'active', $4, 'subscribed', $5, now())
           ON CONFLICT (provider, external_account_id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id, external_account_name = EXCLUDED.external_account_name, status = 'active', encrypted_credentials = EXCLUDED.encrypted_credentials, webhook_status = 'subscribed', metadata = EXCLUDED.metadata, last_sync_at = now(), updated_at = now()
           RETURNING id`,
          [oauthSession.workspace_id, page.id, page.name, credentials, { tasks: page.tasks ?? [], webhook_url: `${process.env.META_WEBHOOK_BASE_URL ?? ""}/webhooks/facebook` }],
        );
        const id = connection.rows[0]?.id;
        if (id) connected.push({ id, page_id: page.id, name: page.name, webhook_status: "subscribed" });
      } catch (error) {
        request.log.error({ error, pageId: page.id }, "facebook page connection failed");
      }
    }
    const result = { workspace_id: oauthSession.workspace_id, connected };
    if (request.headers.accept?.includes("application/json")) return result;
    const redirect = process.env.CHAT2_WEB_URL ?? "http://localhost:18080";
    return reply.redirect(`${redirect}/?facebook=connected&connections=${connected.length}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "META_OAUTH_FAILED";
    request.log.error({ message, stack: error instanceof Error ? error.stack : undefined }, "facebook oauth callback failed");
    return reply.code(502).send({ error: { code: message } });
  }
});

app.post<{ Params: { channelId: string } }>("/api/v1/channels/:channelId/disconnect", async (request, reply) => {
  try {
    const channel = await query<{ workspace_id: string; external_account_id: string; encrypted_credentials: Buffer }>("SELECT workspace_id, external_account_id, encrypted_credentials FROM channel_connections WHERE id = $1", [request.params.channelId]);
    const target = channel.rows[0];
    if (!target) return reply.notFound("Channel not found");
    await requireWorkspaceContext(request, target.workspace_id, "channel:manage");
    try { await unsubscribePage(target.external_account_id, target.encrypted_credentials); } catch (error) { request.log.warn({ error }, "facebook unsubscribe failed"); }
    await query("UPDATE channel_connections SET status = 'revoked', webhook_status = 'unsubscribed', updated_at = now() WHERE id = $1", [request.params.channelId]);
    return { ok: true };
  } catch (error) {
    return reply.code(error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 403).send({ error: { code: error instanceof Error ? error.message : "DISCONNECT_FAILED" } });
  }
});

app.get<{ Params: { channelId: string } }>("/api/v1/channels/:channelId/health", async (request, reply) => {
  try {
    const channel = await query<{ workspace_id: string; provider: string; external_account_id: string; encrypted_credentials: Buffer }>("SELECT workspace_id, provider, external_account_id, encrypted_credentials FROM channel_connections WHERE id = $1", [request.params.channelId]);
    const target = channel.rows[0];
    if (!target) return reply.notFound("Channel not found");
    await requireWorkspaceContext(request, target.workspace_id, "workspace:read");
    if (target.provider !== "facebook_page") return { status: "unknown", provider: target.provider };
    const page = await checkPage(target.external_account_id, target.encrypted_credentials);
    await query("UPDATE channel_connections SET status = 'active', last_sync_at = now(), updated_at = now() WHERE id = $1", [request.params.channelId]);
    return { status: "healthy", provider: target.provider, page };
  } catch (error) {
    return reply.code(error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 502).send({ error: { code: error instanceof Error ? error.message : "CHANNEL_UNHEALTHY" } });
  }
});

app.get<{ Params: { workspaceId: string } }>("/api/v1/workspaces/:workspaceId/conversations", async (request, reply) => {
  try {
    await requireWorkspaceContext(request, request.params.workspaceId, "conversation:read");
    const result = await query(
      `SELECT c.id, c.state, c.handling_mode, c.unread_count, c.last_message_at, c.updated_at,
              ct.id AS contact_id, ct.display_name,
              ca.assignee_user_id, au.display_name AS assignee_display_name,
              cc.id AS connection_id, cc.provider, cc.external_account_name
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
       JOIN channel_connections cc ON cc.id = c.connection_id
       LEFT JOIN conversation_assignments ca ON ca.conversation_id = c.id AND ca.workspace_id = c.workspace_id
       LEFT JOIN users au ON au.id = ca.assignee_user_id
       WHERE c.workspace_id = $1
       ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
       LIMIT 50`,
      [request.params.workspaceId],
    );
    return { data: result.rows, next_cursor: null };
  } catch (error) {
    return reply.code(error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 403).send({ error: { code: error instanceof Error ? error.message : "ACCESS_DENIED" } });
  }
});

app.get<{ Params: { workspaceId: string; conversationId: string } }>("/api/v1/workspaces/:workspaceId/conversations/:conversationId/messages", async (request, reply) => {
  try {
    await requireWorkspaceContext(request, request.params.workspaceId, "conversation:read");
    const conversation = await query<{ id: string }>(
      `SELECT id FROM conversations WHERE id = $1 AND workspace_id = $2`,
      [request.params.conversationId, request.params.workspaceId],
    );
    if (!conversation.rows[0]) return reply.notFound("Conversation not found");
    const result = await query(
      `SELECT id, conversation_id, direction, sender_type, message_type, text, status, external_message_id, occurred_at, created_at
       FROM messages WHERE workspace_id = $1 AND conversation_id = $2 ORDER BY occurred_at ASC LIMIT 200`,
      [request.params.workspaceId, request.params.conversationId],
    );
    return { data: result.rows, next_cursor: null };
  } catch (error) {
    return reply.code(error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 403).send({ error: { code: error instanceof Error ? error.message : "ACCESS_DENIED" } });
  }
});

app.get<{ Params: { workspaceId: string; conversationId: string } }>("/api/v1/workspaces/:workspaceId/conversations/:conversationId/context", async (request, reply) => {
  try {
    await requireWorkspaceContext(request, request.params.workspaceId, "conversation:read");
    const result = await query(
      `SELECT c.id AS conversation_id, c.state, c.handling_mode, c.unread_count, c.last_message_at,
              ct.id AS contact_id, ct.display_name, ct.phone, ct.email, ct.metadata AS contact_metadata,
              ca.assignee_user_id, au.display_name AS assignee_display_name
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id AND ct.workspace_id = c.workspace_id
       LEFT JOIN conversation_assignments ca ON ca.conversation_id = c.id AND ca.workspace_id = c.workspace_id
       LEFT JOIN users au ON au.id = ca.assignee_user_id
       WHERE c.id = $1 AND c.workspace_id = $2
       LIMIT 1`,
      [request.params.conversationId, request.params.workspaceId],
    );
    if (!result.rows[0]) return reply.notFound("Conversation not found");
    return { data: result.rows[0] };
  } catch (error) {
    return reply.code(error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 403).send({ error: { code: error instanceof Error ? error.message : "ACCESS_DENIED" } });
  }
});

app.post<{ Params: { workspaceId: string; conversationId: string }; Body: { assignee_user_id: string | null } }>("/api/v1/workspaces/:workspaceId/conversations/:conversationId/assign", async (request, reply) => {
  try {
    const context = await requireWorkspaceContext(request, request.params.workspaceId, "conversation:assign");
    const body = z.object({ assignee_user_id: z.string().uuid().nullable() }).safeParse(request.body);
    if (!body.success) return reply.badRequest("assignee_user_id must be a UUID or null");
    await withTransaction(async (client) => {
      const assignment = await client.query(
        `INSERT INTO conversation_assignments(conversation_id, workspace_id, assignee_user_id, assigned_by_user_id)
         SELECT c.id, c.workspace_id, $3, $4
         FROM conversations c
         WHERE c.id = $1 AND c.workspace_id = $2
           AND ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = c.workspace_id AND wm.user_id = $3
           ))
         ON CONFLICT (conversation_id) DO UPDATE SET assignee_user_id = EXCLUDED.assignee_user_id, assigned_by_user_id = EXCLUDED.assigned_by_user_id, assigned_at = now()`,
        [request.params.conversationId, request.params.workspaceId, body.data.assignee_user_id, context.userId],
      );
      if (!assignment.rowCount) throw new Error("ASSIGNEE_OR_CONVERSATION_NOT_FOUND");
      await client.query(
        `INSERT INTO audit_logs(workspace_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, 'conversation.assigned', 'conversation', $3, $4)`,
        [request.params.workspaceId, context.userId, request.params.conversationId, body.data],
      );
    });
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error ? error.message : "ASSIGN_FAILED";
    return reply.code(code === "UNAUTHORIZED" ? 401 : code === "ASSIGNEE_OR_CONVERSATION_NOT_FOUND" ? 404 : 403).send({ error: { code } });
  }
});

app.post<{ Params: { workspaceId: string; conversationId: string }; Body: { version?: number } }>("/api/v1/workspaces/:workspaceId/conversations/:conversationId/takeover", async (request, reply) => {
  return updateHandlingMode(request, reply, "human", "conversation:handoff");
});

app.post<{ Params: { workspaceId: string; conversationId: string }; Body: { version?: number } }>("/api/v1/workspaces/:workspaceId/conversations/:conversationId/return-to-ai", async (request, reply) => {
  return updateHandlingMode(request, reply, "ai", "conversation:handoff");
});

async function updateHandlingMode(request: import("fastify").FastifyRequest<{ Params: { workspaceId: string; conversationId: string }; Body: { version?: number } }>, reply: import("fastify").FastifyReply, mode: "ai" | "human", permission: "conversation:handoff") {
  try {
    const context = await requireWorkspaceContext(request, request.params.workspaceId, permission);
    const result = await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE conversations SET handling_mode = $1, updated_at = now(), version = version + 1
         WHERE id = $2 AND workspace_id = $3 AND ($4::integer IS NULL OR version = $4)
         RETURNING id, handling_mode, version`,
        [mode, request.params.conversationId, request.params.workspaceId, request.body?.version ?? null],
      );
      if (!updated.rowCount) throw new Error("CONVERSATION_VERSION_CONFLICT");
      await client.query(
        `INSERT INTO audit_logs(workspace_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, 'conversation', $4, $5)`,
        [request.params.workspaceId, context.userId, `conversation.handoff.${mode}`, request.params.conversationId, { mode }],
      );
      return updated.rows[0];
    });
    return { data: result };
  } catch (error) {
    return reply.code(error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 409).send({ error: { code: error instanceof Error ? error.message : "HANDOFF_FAILED" } });
  }
}

const sendMessageBody = z.object({ text: z.string().trim().min(1).max(10_000) });

app.post<{ Params: { workspaceId: string; conversationId: string } }>("/api/v1/workspaces/:workspaceId/conversations/:conversationId/messages", async (request, reply) => {
  try {
    const context = await requireWorkspaceContext(request, request.params.workspaceId, "conversation:reply");
    const body = sendMessageBody.safeParse(request.body);
    if (!body.success) return reply.badRequest("Message text is required");
    const clientMessageId = request.headers["idempotency-key"]?.toString();
    if (!clientMessageId) return reply.badRequest("Idempotency-Key is required");

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, status, conversation_id, text, created_at FROM messages WHERE workspace_id = $1 AND client_message_id = $2`,
        [request.params.workspaceId, clientMessageId],
      );
      if (existing.rows[0]) return { message: existing.rows[0], created: false };

      const conversation = await client.query<{ id: string; connection_id: string; contact_id: string; external_user_id: string }>(
        `SELECT c.id, c.connection_id, c.contact_id, ci.external_user_id
         FROM conversations c
         JOIN contact_identities ci ON ci.contact_id = c.contact_id AND ci.connection_id = c.connection_id
         WHERE c.id = $1 AND c.workspace_id = $2
           AND EXISTS (SELECT 1 FROM channel_connections cc WHERE cc.id = c.connection_id AND cc.workspace_id = c.workspace_id)
           AND ci.workspace_id = c.workspace_id
         LIMIT 1`,
        [request.params.conversationId, request.params.workspaceId],
      );
      const target = conversation.rows[0];
      if (!target) throw new Error("CONVERSATION_NOT_FOUND");

      const message = await client.query(
        `INSERT INTO messages(workspace_id, conversation_id, connection_id, direction, sender_type, message_type, text, client_message_id, status, occurred_at)
         VALUES ($1, $2, $3, 'outbound', 'agent', 'text', $4, $5, 'queued', now())
         RETURNING id, status, conversation_id, text, created_at`,
        [request.params.workspaceId, target.id, target.connection_id, body.data.text, clientMessageId],
      );
      const stored = message.rows[0];
      if (!stored) throw new Error("MESSAGE_CREATE_FAILED");

      await client.query(
        `UPDATE conversations SET handling_mode = 'human', updated_at = now(), version = version + 1 WHERE id = $1 AND workspace_id = $2`,
        [target.id, request.params.workspaceId],
      );
      await client.query(
        `INSERT INTO outbox_events(workspace_id, event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, 'message.send.requested', 'message', $2, $3)`,
        [request.params.workspaceId, stored.id, { message_id: stored.id, connection_id: target.connection_id, recipient_external_id: target.external_user_id, text: body.data.text }],
      );
      await client.query(
        `INSERT INTO audit_logs(workspace_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, 'message.queued', 'message', $3, $4)`,
        [request.params.workspaceId, context.userId, stored.id, { conversation_id: target.id }],
      );
      return { message: stored, created: true };
    });
    return reply.code(result.created ? 201 : 200).send({ data: result.message, duplicate: !result.created });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MESSAGE_CREATE_FAILED";
    const status = code === "UNAUTHORIZED" ? 401 : code === "PERMISSION_DENIED" ? 403 : code === "CONVERSATION_NOT_FOUND" ? 404 : 409;
    return reply.code(status).send({ error: { code } });
  }
});

app.get<{ Params: { workspaceId: string }; Querystring: { since?: string } }>("/api/v1/workspaces/:workspaceId/realtime", async (request, reply) => {
  try {
    await requireWorkspaceContext(request, request.params.workspaceId, "conversation:read");
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write(": chat2 connected\n\n");
    let cursor = request.query.since ?? new Date(0).toISOString();
    let closed = false;
    const timer = setInterval(async () => {
      if (closed) return;
      try {
        const result = await query<{ id: string; conversation_id: string; status: string; text: string | null; created_at: string }>(
          `SELECT id, conversation_id, status, text, created_at FROM messages WHERE workspace_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT 100`,
          [request.params.workspaceId, cursor],
        );
        for (const message of result.rows) {
          response.write(`event: message.created\ndata: ${JSON.stringify(message)}\n\n`);
          cursor = message.created_at;
        }
        response.write(": keep-alive\n\n");
      } catch {
        response.write("event: error\ndata: {\"code\":\"REALTIME_QUERY_FAILED\"}\n\n");
      }
    }, 1000);
    request.raw.on("close", () => {
      closed = true;
      clearInterval(timer);
    });
  } catch (error) {
    return reply.code(error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 403).send({ error: { code: error instanceof Error ? error.message : "ACCESS_DENIED" } });
  }
});

app.get<{ Params: { connectionId: string }; Querystring: { "hub.mode"?: string; "hub.verify_token"?: string; "hub.challenge"?: string } }>(
  "/webhooks/facebook/:connectionId",
  async (request, reply) => {
    const query = request.query;
    if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === verifyToken) {
      return reply.type("text/plain").send(query["hub.challenge"] ?? "");
    }
    return reply.unauthorized("Invalid webhook verification token");
  },
);

const facebookPayload = z.object({
  object: z.string(),
  entry: z.array(z.unknown()).default([]),
});

function facebookPageId(payload: z.infer<typeof facebookPayload>): string | undefined {
  const first = payload.entry[0];
  if (!first || typeof first !== "object" || !("id" in first)) return undefined;
  const id = (first as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

async function ingestFacebookWebhook(connectionId: string, request: any, reply: any, parsed: z.infer<typeof facebookPayload>, rawBody: Buffer | undefined) {
  const externalEventId = request.headers["x-facebook-event-id"]?.toString()
    ?? (rawBody ? createHash("sha256").update(rawBody).digest("hex") : randomUUID());
  const webhookEvent = {
    provider: "facebook_page" as const,
    connectionId,
    externalEventId,
    receivedAt: new Date().toISOString(),
    payload: parsed,
  };

  let inserted: boolean;
  let messageCount = 0;
  try {
    if (store instanceof PostgresWebhookStore) {
      const result = await store.ingestFacebook(webhookEvent);
      inserted = result.inserted;
      messageCount = result.messageCount;
    } else {
      inserted = await store.insertIfNew(webhookEvent);
    }
  } catch (error) {
    request.log.error({ error, externalEventId }, "facebook webhook processing failed");
    return reply.internalServerError("Webhook processing failed");
  }

  request.log.info({ externalEventId, inserted, messageCount }, "facebook webhook accepted");
  return reply.code(200).send({ received: true, duplicate: !inserted, message_count: messageCount });
}

app.get<{ Querystring: { "hub.mode"?: string; "hub.verify_token"?: string; "hub.challenge"?: string } }>(
  "/webhooks/facebook",
  async (request, reply) => {
    const query = request.query;
    if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === verifyToken) {
      return reply.type("text/plain").send(query["hub.challenge"] ?? "");
    }
    return reply.unauthorized("Invalid webhook verification token");
  },
);

app.post<{ Params: { connectionId: string } }>(
  "/webhooks/facebook/:connectionId",
  async (request, reply) => {
    const rawBody = (request as typeof request & { rawBody?: Buffer }).rawBody;
    if (!hasValidMetaSignature(request.headers["x-hub-signature-256"]?.toString(), rawBody)) {
      return reply.unauthorized("Invalid Facebook webhook signature");
    }
    const parsed = facebookPayload.safeParse(request.body);
    if (!parsed.success) return reply.badRequest("Invalid Facebook webhook payload");
    return ingestFacebookWebhook(request.params.connectionId, request, reply, parsed.data, rawBody);
  },
);

app.post("/webhooks/facebook", async (request, reply) => {
  const rawBody = (request as typeof request & { rawBody?: Buffer }).rawBody;
  if (!hasValidMetaSignature(request.headers["x-hub-signature-256"]?.toString(), rawBody)) {
    return reply.unauthorized("Invalid Facebook webhook signature");
  }
  const parsed = facebookPayload.safeParse(request.body);
  if (!parsed.success) return reply.badRequest("Invalid Facebook webhook payload");
  const pageId = facebookPageId(parsed.data);
  if (!pageId) return reply.badRequest("Facebook page id is missing");
  const connection = await query<{ id: string }>(
    `SELECT id FROM channel_connections WHERE provider = 'facebook_page' AND external_account_id = $1 AND status = 'active' LIMIT 1`,
    [pageId],
  );
  const connectionId = connection.rows[0]?.id;
  if (!connectionId) return reply.notFound("Facebook page is not connected");
  return ingestFacebookWebhook(connectionId, request, reply, parsed.data, rawBody);
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

export { app };
