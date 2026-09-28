# Architecture decisions — chat2 Platform

## Chosen baseline

- **Runtime:** TypeScript on Node.js, Fastify for HTTP APIs.
- **Repository:** pnpm monorepo with independent apps/packages.
- **Primary database:** PostgreSQL. It owns tenants, connections, contacts, conversations, messages, webhook inbox records and outbox records.
- **Redis:** queue/cache/realtime fan-out only; never the source of truth.
- **Async delivery:** PostgreSQL Inbox/Outbox pattern first. Kafka is deferred until measured throughput/order requirements justify it.
- **Realtime:** SSE for MVP; WebSocket can be added when bidirectional presence/typing is needed.
- **Provider order:** Facebook Page first, Zalo OA second. Instagram and WhatsApp remain separate adapters.
- **Meta integration:** API version is configuration, pinned per deployment/connection, and monitored for sunset. Page access tokens are encrypted and never returned to clients/logs.
- **Security:** OAuth state/PKCE, signed webhook verification, tenant-scoped authorization, idempotency on ingress and egress, append-only audit events.

## MVP invariants

1. A webhook is acknowledged only after its durable inbox record is written.
2. Every inbound provider event is deduplicated by `(provider, connection_id, external_event_id)`.
3. Every outbound send has a platform idempotency key and a separate provider message id.
4. A stale AI action cannot send after a conversation has transitioned to `human`.
5. Every tenant-owned query carries a server-derived `workspace_id`.

## Deferred decisions

- Kafka/Redpanda adoption.
- Cross-provider contact auto-merge.
- Full-text search engine.
- Campaign/broadcast support.
- Billing and marketplace.
