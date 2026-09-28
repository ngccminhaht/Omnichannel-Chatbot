# Target System Architecture

> This is a target-design document. It distinguishes verified current behavior from future architecture and migration work. Future domains described here are not claims that those domains currently exist. The companion `FRONTEND_TARGET_ARCHITECTURE_AND_DESIGN_SYSTEM.md` defines the shared web shell and design system; this document governs platform/domain boundaries.

## 1. Architecture Vision

The core principle is **one platform, multiple business domains**. Users should experience one workspace product with shared identity, customer data, permissions, navigation and design language. Internally, each domain must have explicit ownership so that adding commerce, AI or growth capabilities does not turn the Inbox into an unmaintainable dependency hub.

**CURRENT:** an omnichannel Inbox MVP with workspace membership, Facebook Page integration, conversations, messages, handoff, PostgreSQL Inbox/Outbox persistence and a static web inbox.

**TARGET:** a unified Omnichannel Commerce & Customer Operations Platform containing Customer Operations, AI & Automation, Commerce, Growth, Analytics and Platform Administration as technically separated modules inside one product.

**MIGRATION:** evolve the current modular monolith in small vertical slices. First create boundaries around existing Conversations/Channels and Customers, then add AI/Automation and Commerce. Preserve current API behavior, workspace scoping, provider abstraction, transaction/outbox behavior and inbox UX while extracting responsibilities.

The platform must not become one huge tightly coupled application. Domain modules should own their business rules and persistence access, communicate through application services and versioned events, and expose only intentional public contracts. This separation lets Inbox functionality remain stable while future modules consume customer or order events.

## 2. Current Architecture Baseline

The repository is a workspace monorepo:

- `apps/api`: Fastify TypeScript API, auth/RBAC, SQL coordination, Facebook integration, webhook stores, migration entrypoint and worker entrypoint.
- `apps/web`: nginx-served static frontend. `public/index.html` contains all markup, CSS and browser JavaScript.
- `packages/contracts`: shared TypeScript contract package.
- `db/migrations`: ordered PostgreSQL migrations.
- `docker-compose.yml`: API, worker, web, PostgreSQL 17 and Redis 7 services.

Verified backend behavior includes:

- Fastify routes in `apps/api/src/server.ts`;
- PostgreSQL access through `pg` in `db.ts`, with explicit `withTransaction` support;
- workspace membership and permissions in `auth.ts` and `rbac.ts`;
- Facebook webhook raw-body/signature verification and normalization;
- channel connection OAuth and AES-256-GCM encrypted credentials;
- Inbox/Outbox tables and worker delivery behavior;
- conversation/message APIs, assignment/handoff and SSE endpoint;
- `ChannelProvider` currently exposes only `sendText`; `getChannelProvider()` returns the Facebook implementation. The broader provider interface below is a target, not an existing implementation;
- a browser fetch wrapper, page-local state and polling fallback in `index.html`.

Redis is configured and deployed in Compose, but a verified Redis client/queue implementation is not present in the inspected TypeScript source. It must therefore be treated as available infrastructure, not as an existing application dependency.

Important current limits: `apps/web/public/index.html` embeds a local API key and user ID; these are not provider credentials, but they are not a production authentication model. `worker.ts` consumes only `message.send.requested`; the `message.received` outbox rows written by `webhook-store.ts` have no verified consumer. The SSE route polls `messages` directly rather than being fed from Outbox, and the browser does not subscribe to it. Database foreign keys do not consistently enforce that related rows have the same `workspace_id`. The worker marks jobs `sending`, but its claim query selects only `queued` rows, so a crash after claim can strand a row. These are verified migration risks, not target behavior.

### Current decisions to preserve

1. Workspace-scoped authorization and permission checks.
2. The existing Facebook normalization and send files as a starting point for a fuller provider boundary.
3. PostgreSQL as the transactional source of truth.
4. Transactional Inbox/Outbox behavior for durable message processing.
5. Encrypted provider credentials and the rule that provider secrets stay server-side; replace the current browser-embedded local API key before production use.
6. Explicit migrations rather than an unverified ORM assumption.
7. Shared contracts package, expanded carefully by domain.
8. Docker Compose as the local integration environment.

## 3. Target High-Level Architecture

```text
Users / Browser / future mobile clients
                    │
                    ▼
             Web Application
       App shell + shared design system
                    │
                    ▼
              API Layer / BFF
       versioned routes, auth, validation,
       request IDs, permissions, rate limits
                    │
                    ▼
          Application Service Layer
  ┌─────────────┬────────────┬─────────────┐
  │ Platform    │ Customer   │ Conversations│
  │ AI/Auto     │ Commerce   │ Growth       │
  │ Analytics   │ Integrations               │
  └─────────────┴────────────┴─────────────┘
                    │
                    ▼
           Domain modules / policies
                    │ declared ports
                    ▼
       Repository/provider interfaces
                    ▲ implemented by
       Repositories + infrastructure adapters
       ┌──────────┬──────────┬──────────────┐
       │Postgres  │Redis/job │Object storage│
       │          │queue     │(future)      │
       └──────────┴──────────┴──────────────┘
                    │
                    ▼
       Provider adapters / external systems
 Facebook, Instagram, Zalo, WhatsApp, TikTok,
 Shopee, payments, shipping and future providers
```

The target remains a modular monolith first. The API layer owns transport concerns. Application services coordinate use cases. Domain modules own business rules and public events. Domain/application code depends on interfaces; infrastructure adapters implement those interfaces. Domain policies must not import PostgreSQL, queue, object storage or provider SDK implementations.

## 4. Target Repository Structure

The target should evolve from the current `apps/*` and `packages/*` workspaces instead of creating one application per business domain.

```text
apps/
├── api/
│   └── src/
│       ├── app/                    # Fastify composition and route registration
│       ├── modules/                # modular-monolith domain modules
│       │   ├── platform/
│       │   ├── conversations/
│       │   ├── customers/
│       │   ├── ai/
│       │   ├── automation/
│       │   ├── commerce/
│       │   ├── growth/
│       │   ├── analytics/
│       │   └── integrations/
│       ├── shared/                 # genuinely cross-module infrastructure
│       └── worker/                 # job entrypoints and consumers
├── web/
│   └── src/
│       ├── app/                    # bootstrap, router, providers
│       ├── components/ui/          # reusable visual primitives
│       ├── components/layout/      # AppShell and navigation
│       ├── features/               # user-facing domain slices
│       ├── services/               # API client and transport concerns
│       └── styles/                 # tokens and global styles
└── worker/                         # only if worker lifecycle needs own package

packages/
├── contracts/                      # versioned external/API/event schemas
├── config/                         # shared typed configuration, if needed
└── shared/                         # small, dependency-light shared primitives

db/
├── migrations/                     # ordered schema changes
└── seeds/                          # local/test data only, if needed

docs/
└── adr/                            # accepted architecture decisions
```

This tree is TARGET, not current state. Do not create empty directories in advance.

Directory rules:

- `apps/api/src/app` may compose modules and transport plugins, but must not become the home for all business logic.
- `modules/<domain>` owns that domain's use cases, policies, repository interfaces, route schemas and tests. SQL implementations may live in its infrastructure subfolder. It must not import another module's private implementation.
- `shared` may contain database primitives, errors, IDs, logging and cross-domain infrastructure. It must not become a generic business `utils` dumping ground.
- `packages/contracts` contains stable boundary schemas/types, not SQL models, database rows, provider secrets or internal domain aggregates.
- `apps/web/src/components/ui` contains generic UI primitives and no domain API calls.
- `apps/web/src/components/layout` contains product shell/navigation and no provider-specific business rules.
- `apps/web/src/features` owns frontend composition for a domain and may call the approved API client, not raw provider APIs.
- `db/migrations` contains schema evolution only; it must not contain application orchestration.
- `docs/adr` records decisions; it is not a second source of runtime configuration.

## 5. Domain Architecture

The following are TARGET bounded domains. “Current” notes identify only verified existing concepts.

### Platform

**Responsibilities:** authentication, organizations, workspaces/tenants, users, teams, roles, permissions, audit and policies for external integration access. Generic integration registry/configuration may live here; channel connection lifecycle and encrypted channel tokens belong to Integrations.

**Current:** users, workspaces, workspace members, roles/permissions and audit-related records are present. Organization, billing and full authentication are not verified.

**Target owned entities:** Organization, Workspace, User, Membership, Team, Role, Permission, AuditEntry and non-channel integration policy/registry entries when a use case requires them.

**API ownership:** future `/api/v1/organizations`, `/workspaces`, `/users`, `/teams`, `/roles`, `/audit`, plus platform integration policy endpoints if introduced.

**Dependencies:** owns tenant context; may be consumed by every domain for authorization. It must not contain conversation, order or provider business logic.

**Publishes:** `WorkspaceCreated`, `MembershipChanged`, `PermissionChanged`, `IntegrationConnected`.

**Consumes:** security/provider health events where an audit record is required.

### Conversations

**Responsibilities:** inbox state, inbound/outbound message lifecycle, conversations, assignments and human/AI handoff. It consumes a provider-neutral channel account reference; Integrations owns connection lifecycle and credentials.

**Current:** Facebook Page channels, webhook ingestion, conversations, messages, assignment/handoff and Outbox delivery are implemented in the MVP.

**Target owned entities:** Conversation, Message, Attachment, Assignment, Handoff and message delivery state. ChannelConnection, channel credentials and raw WebhookEvent belong to Integrations; ContactPoint and ChannelIdentity belong to Customers.

**API ownership:** `/api/v1/workspaces/:workspaceId/conversations` and nested messages/assignments/handoffs. Channel connection endpoints belong to Integrations. Existing public URLs may stay unchanged after ownership moves.

**Dependencies:** Platform for tenant/permission context; Customers' public identity service or `CustomerId`; Integrations' public send/connection port. It may reference Product/Order IDs in message context, but does not own those records.

**Publishes:** `MessageReceived`, `MessageQueued`, `MessageSent`, `MessageDelivered`, `MessageFailed`, `ConversationUpdated`, `ConversationAssigned`, `AgentHandoffRequested`.

**Consumes:** `CustomerMerged` for reference reconciliation, `ChannelConnected`, AI reply/handoff commands and relevant order context events when a concrete use case exists.

### Customers

**Responsibilities:** unified customer identity, contacts, channel identities, profiles, tags, segments, notes and customer timeline.

**Current:** contact and contact-identity concepts exist in database/message ingestion. A full CRM module is not verified.

**Target owned entities:** Customer, ContactPoint, ChannelIdentity, CustomerTag, SegmentMembership, CustomerNote, TimelineEntry.

**API ownership:** `/api/v1/workspaces/:workspaceId/customers`, `/contacts`, `/segments`, `/tags`.

**Dependencies:** Platform for workspace ownership. It accepts provider-neutral identity observations from Integrations/Conversations through its public service or a versioned event; it does not import Conversations internals. Commerce/Growth may reference Customer IDs but must not duplicate the customer model.

**Publishes:** `CustomerCreated`, `CustomerUpdated`, `CustomerMerged`, `CustomerSegmentChanged`.

**Consumes:** provider-neutral identity observations to link channel identities; `MessageReceived`, `OrderCreated`, `OrderPaid` and loyalty/campaign events may enrich a customer timeline after the relevant consumers are implemented.

### Integrations / Channels

**Responsibilities:** channel connection lifecycle, provider credentials, OAuth, webhook verification/deduplication, provider adapters and delivery ports. Non-channel payment/shipping adapters can follow the same integration boundary when those domains exist; their transaction policy stays in Commerce.

**Current:** Facebook OAuth/webhook/client and encrypted channel credentials are implemented in `server.ts`, `facebook-client.ts`, `facebook-adapter.ts`, `provider.ts` and `webhook-store.ts`. The database permits `zalo_oa` as a provider value, but a verified Zalo adapter is absent. `integration_connections`/`integration_events` tables exist without a verified Oriagent runtime integration.

**Target owned entities:** ChannelConnection, ChannelCredentialReference, WebhookReceipt, ProviderDeliveryAttempt and provider configuration. Conversations owns canonical messages and their status; Customers owns channel identity linkage.

**API ownership:** existing `/api/v1/workspaces/:workspaceId/channels/...`, `/api/v1/channels/:channelId/...`, `/api/v1/oauth/facebook_page/callback` and `/webhooks/facebook`, with new provider routes only when adapters are implemented.

**Dependencies:** Platform for workspace/permission context; Customers' public identity-link command and Conversations' inbound-message command. No direct writes to their private tables after migration.

**Publishes:** `ChannelConnected`, `ChannelDisconnected`, `WebhookAccepted`, `ProviderDeliverySucceeded`, `ProviderDeliveryFailed`.

**Consumes:** `MessageSendRequested` and explicit credential-rotation commands.

### AI

**Responsibilities:** agents, prompts, knowledge retrieval, tool execution, guardrails, evaluations and proposed AI messages. Conversations alone owns the final message/handoff state.

**Current:** conversation handling modes and handoff state exist; an AI runtime and knowledge base are not verified.

**Target owned entities:** AIAgent, PromptVersion, KnowledgeSource, ToolDefinition, ToolRun, GuardrailPolicy and Evaluation.

**API ownership:** future `/api/v1/workspaces/:workspaceId/ai/...` and `/knowledge/...`.

**Dependencies:** Platform permissions; Conversations' public message/handoff commands; Customers' public context contract; Commerce only through explicitly authorized tools/services.

**Publishes:** `AIResponseProposed`, `AgentHandoffRequested`, `AIEvaluationCompleted`.

**Consumes:** `MessageReceived`, `ConversationUpdated` and explicit tool results when an AI use case is implemented.

### Automation

**Responsibilities:** workflows, triggers, conditions, actions, execution limits and retries. It orchestrates approved domain commands; it does not own their transactional records.

**Current:** no verified workflow engine or automation runtime.

**Target owned entities:** Workflow, Trigger, Condition, Action and AutomationRun.

**API ownership:** future `/api/v1/workspaces/:workspaceId/automations/...`.

**Dependencies:** Platform permissions; public commands/events from Conversations, Customers, AI and Commerce. Domain access is mediated through allowed actions, not direct SQL.

**Publishes:** `AutomationRunStarted`, `AutomationRunCompleted`, `AutomationRunFailed`.

**Consumes:** approved `MessageReceived`, `CustomerUpdated`, `OrderCreated` and other versioned triggers as they are implemented.

### Commerce

**Responsibilities:** products, variants, categories, orders, payments, inventory, warehouses, shipping, returns and POS.

**Current:** no verified Commerce implementation.

**Target owned entities:** Product, Variant, Category, Order, OrderLine, Payment, InventoryItem, Warehouse, Shipment, Return, POSLocation, POSSession.

**API ownership:** `/api/v1/workspaces/:workspaceId/products`, `/orders`, `/inventory`, `/warehouses`, `/shipments`, `/returns`, `/pos`.

**Dependencies:** Platform for tenant/permission; Customers for Customer ID; Integrations for payment/shipping/channel adapters. Commerce must not query private Conversations tables directly.

**Publishes:** `OrderCreated`, `OrderPaid`, `OrderCancelled`, `InventoryChanged`, `ShipmentUpdated`, `ReturnCreated`.

**Consumes:** `CustomerUpdated`, channel/order-import events, promotion and payment provider events.

### Growth

**Responsibilities:** promotions, coupons, loyalty, campaigns and customer segmentation activation.

**Current:** no verified Growth implementation.

**Target owned entities:** Promotion, Coupon, LoyaltyAccount, LoyaltyLedgerEntry, Campaign, Audience.

**API ownership:** `/api/v1/workspaces/:workspaceId/promotions`, `/loyalty`, `/campaigns`.

**Dependencies:** Customers for audiences; Commerce for eligible products/orders; Conversations for campaign channels; Platform for permissions.

**Publishes:** `PromotionCreated`, `CouponRedeemed`, `LoyaltyChanged`, `CampaignMessageRequested`.

**Consumes:** `OrderPaid`, `CustomerSegmentChanged`, `MessageSent` and consent events.

### Analytics

**Responsibilities:** operational, conversation, agent, sales, order, customer and AI metrics.

**Current:** no verified analytics module or warehouse.

**Target owned entities:** metric definitions, projections, aggregates and report views. Analytics should not own transactional Order or Conversation state.

**API ownership:** `/api/v1/workspaces/:workspaceId/analytics`.

**Dependencies:** consumes versioned domain events and read models; should not be a dependency of critical transactional writes.

**Publishes:** derived metric refresh events only when needed.

**Consumes:** all approved business events, with tenant and event-version metadata.

## 6. Domain Dependency Rules

Allowed dependency direction:

```text
HTTP / web
   ↓
Application services
   ↓
Domain policies and aggregates
   ↓
Repository interfaces / provider ports
   ↓
Infrastructure adapters

Cross-domain calls use public application services or versioned events.
Private tables, private classes and private module files are not cross-domain APIs.
```

Rules:

- Conversations may reference `CustomerId`; it must not directly query Product tables. Customers does not depend back on Conversations' private code.
- Integrations owns connection credentials/webhook receipts; Conversations owns message state; Customers owns channel identity linking. A webhook pipeline coordinates these through public commands/contracts.
- Orders may reference `CustomerId`; Customer data must not be copied into an incompatible order-owned customer model.
- Analytics consumes events and read models; it does not own transactional business logic.
- Providers remain behind integration adapters and canonical contracts.
- Frontend code never contains provider credentials or calls provider APIs directly.
- Every business operation enforces workspace/tenant context before reading or writing data.
- Cross-domain synchronous calls must be explicit and rare; use events for side effects.
- A domain may depend on shared primitives and public contracts, never on another domain's private persistence implementation.

## 7. Multi-Tenant Architecture

Target relationship:

```text
Organization
  └── Workspace / Tenant
       ├── Membership → User
       ├── Team → Memberships
       ├── Role → Permissions
       └── Business records and connected provider accounts
```

**TARGET (conditional):** introduce Organization as a billing/administrative parent only when multi-workspace ownership is required; it is not present today. Until then, Workspace remains the tenant boundary. If Organization is introduced, one organization may own multiple workspaces and a user may belong to multiple workspaces through memberships. Organization membership never implicitly grants access to every child workspace; explicit permission is required.

Rules for future developers:

- Every tenant-owned record has `workspace_id` or an unambiguous ownership path.
- Every query receives workspace context from authenticated server state, never from an untrusted client value alone.
- Every repository method makes workspace scope explicit.
- Unique constraints include workspace scope where business identity is tenant-local.
- Cache keys include organization/workspace scope and user-sensitive permission dimensions.
- Queue payloads include workspace ID and an idempotency key; workers re-check authorization/ownership before executing sensitive work.
- Provider accounts are owned by exactly one workspace in the application model unless an explicit organization-level sharing policy exists.
- Cross-workspace reads are forbidden by default, including admin tooling unless explicitly authorized and audited.

**CURRENT gap and migration:** `channel_connections` uses `UNIQUE (provider, external_account_id)`, and the OAuth upsert can replace `workspace_id` for an existing Page; this is not a safe implicit transfer policy. Foreign keys in `db/migrations/001_initial.sql` reference IDs but do not uniformly prove same-workspace ownership, and assignment does not verify that the assignee belongs to the workspace. First define whether a provider account may be transferred, then reject accidental cross-workspace reconnects and audit explicit transfers. Add workspace consistency checks/constraints and membership validation with migrations and characterization tests. Do not change the uniqueness rule blindly: one external Page may need to remain globally exclusive.

## 8. Authentication & Authorization Architecture

**Target authentication:** a dedicated identity/session boundary should authenticate users, support revocation and expire sessions. Whether the browser uses server-managed cookies, short-lived access tokens plus refresh tokens, or another mechanism is a later ADR; the exact identity provider is not selected by the repository.

**Target authorization:** retain workspace RBAC as the baseline, then add permission scopes and resource policies for teams, channels, records and sensitive actions. Permission checks should occur at the API/application-service boundary, not only in the UI.

**Service access:** background workers use service credentials scoped to the job/workspace and record actor/source metadata. Service-to-service access is only needed after a separate deployable boundary exists.

**Migration from MVP:** the current web page embeds `CHAT2_API_KEY`'s local value and sends `x-chat2-user-id` from browser JavaScript (`index.html`, `auth.ts`). Treat this as local/demo access only. Keep it in isolated local development during a transition, but do not promote or bundle it in a production frontend. Introduce an auth/session boundary, derive the user from verified server-side credentials, preserve `requireWorkspaceContext`'s workspace/permission semantics, then remove the static path after clients and deployments migrate. Select the identity provider/session form in an ADR; a refresh-token scheme is an option, not a prerequisite for a server-managed session.

## 9. API Architecture

Target resource conventions:

```text
/api/v1/workspaces/:workspaceId/conversations
/api/v1/workspaces/:workspaceId/customers
/api/v1/workspaces/:workspaceId/orders
/api/v1/workspaces/:workspaceId/products
/api/v1/workspaces/:workspaceId/analytics
```

Conventions:

- plural nouns for resources; action endpoints only for explicit commands such as `takeover`, `close`, `refund` or `sync`;
- cursor pagination for large collections, with documented stable sort keys;
- validated filter and sort allowlists;
- consistent success envelope, for example `{ data, meta }`;
- consistent error envelope `{ error: { code, message, details?, requestId } }`;
- request ID generated at the edge and propagated to logs/events/provider calls;
- Zod or the selected contract validator at transport boundaries;
- `Idempotency-Key` required for retried mutations such as sends, payments, order creation and provider syncs;
- permission enforcement before application-service execution;
- no credentials or internal database details in responses.

**CURRENT:** list endpoints in `server.ts` use fixed `LIMIT 50`/`LIMIT 200` and return `next_cursor: null`; error responses vary by route. Cursor pagination and a unified error envelope are targets. Preserve response compatibility for existing clients or version the contract during migration.

Route handlers should be thin. New routes belong in module route files registered by an application composition layer. Avoid extending the current `server.ts` indefinitely: migrate route registration and orchestration module by module while preserving URLs.

## 10. Application Service Layer

The target request path is:

```text
POST /orders
  ↓
Order route/controller
  ↓ validate auth, workspace, contract
CreateOrderService
  ↓
Order domain policy
  ↓
OrderRepository + PaymentPort + Outbox
```

Responsibilities:

- HTTP handler: parse input, authorize, call service, map result/error to HTTP.
- Application service: coordinate one use case and transaction boundary.
- Domain: enforce invariants and state transitions without Fastify/SQL/provider knowledge.
- Repository: persist and query owned aggregates with workspace scope.
- Infrastructure adapter: implement PostgreSQL, queue, object storage or provider ports.

SQL and provider calls must not accumulate in route handlers. The current `server.ts` can be split incrementally by moving one route family and its orchestration at a time.

## 11. Data Access Architecture

PostgreSQL remains the transactional source of truth. Continue using explicit SQL and migrations initially; an ORM is not required and is not justified by current evidence.

Target conventions:

- repository interfaces live with the owning module;
- SQL implementations live behind the module's data-access boundary;
- transactions are created by the application service/use case and passed to repositories, or managed by a narrowly scoped unit-of-work abstraction;
- migrations remain ordered, reviewable and forward-only;
- indexes support workspace filters, external IDs, idempotency keys, event status and stable pagination;
- every tenant query includes workspace ownership predicates;
- outbox writes occur in the same transaction as the business change;
- read-heavy analytics projections may use separate tables later without changing transactional ownership.

Where tenant-owned foreign keys cross tables, enforce workspace consistency in application queries and, where practical, with composite keys/constraints. A plain UUID foreign key does not establish same-workspace ownership. Existing IDs and tables must be backfilled/validated before adding restrictive constraints.

Migration from direct SQL does not require an ORM rewrite: extract existing parameterized queries from `server.ts` into repository modules, add tests around behavior, then introduce service boundaries while keeping the same tables and migration system.

## 12. Event & Async Architecture

The target keeps the current Inbox/Outbox idea and generalizes it:

```text
Business transaction
   ↓ same PostgreSQL transaction
Transactional record + Outbox event
   ↓
Worker claims event/job idempotently
   ↓
Queue or direct worker processing
   ↓
Provider delivery / projection / notification
```

Conceptual event names include `MessageReceived`, `MessageSent`, `ConversationAssigned`, `CustomerUpdated`, `OrderCreated`, `OrderPaid`, `InventoryChanged` and `AgentHandoffRequested`. Existing stored names use dotted lowercase strings such as `message.received` and `message.send.requested`. Adopt a documented wire naming/version scheme before adding consumers; do not silently rename persisted events. Events must carry event ID, type/version, workspace ID, aggregate ID, occurred time, trace/request ID and safe payload.

**CURRENT:** `webhook-store.ts` writes `message.received` Outbox rows while `worker.ts` selects only `message.send.requested`. The SSE route queries `messages` directly. The current worker is therefore not a general event dispatcher, and inbound Outbox delivery is not verified. Its `sending` status also needs recovery after worker crashes. **MIGRATION:** inventory every existing event type and consumer, define one canonical naming/version policy with adapters for old rows, add consumer idempotency and leases/reclaim for stuck jobs, and prove delivery/replay before adding more event-producing domains. Outbox delivery is at-least-once; provider sends need a reconciliation/idempotency strategy because a crash after provider acceptance but before local status update can duplicate effects.

Critical transactional data includes conversation state, messages, orders, payments and inventory reservations. Side effects such as realtime fan-out, analytics projection, notifications, provider delivery and search indexing are asynchronous.

Redis may later provide queue coordination, locks, cache and pub/sub, but a durable event source remains PostgreSQL Outbox until scale and operational evidence justify another broker. Every job needs retry policy, dead-letter handling, idempotency and tenant context.

## 13. Provider Integration Architecture

All channel providers implement a canonical port similar to:

```text
ChannelProvider
├── connect()
├── verifyWebhook()
├── normalizeInboundEvent()
├── sendMessage()
├── refreshCredential()
├── subscribeWebhook()
└── healthCheck()
```

Facebook, Instagram, Zalo, WhatsApp, TikTok and Shopee adapters own provider payloads, tokens, rate limits, error mappings and webhook details. Conversation logic receives canonical events and never branches on provider payload shapes.

**TARGET:** credentials are encrypted at rest, resolved only in backend adapters, never returned to browser code, and excluded from logs/traces. OAuth state is one-time and workspace-bound. Provider IDs are stored alongside canonical IDs with provider/connection uniqueness constraints. **CURRENT risk:** `facebook-client.ts` and `provider.ts` construct Meta Graph URLs containing access tokens as query parameters. Migration should use provider-supported authorization headers/body where possible and ensure URL/error logging redacts tokens; this is a documented remediation, not a claim that the current code already follows the target rule.

## 14. Realtime Architecture

The current API exposes SSE at `/api/v1/workspaces/:workspaceId/realtime`, while the current browser polls every three seconds. Native browser `EventSource` cannot attach the current custom Authorization and user-ID headers; SSE is not currently wired into the web app. Preserve SSE as the first inbox realtime mechanism for server-to-client events once browser-safe authentication exists. Do not put long-lived API keys in stream URLs.

Target strategy:

- SSE for inbox message/assignment/status streams and simple workspace fan-out;
- polling fallback for degraded proxies or clients that cannot hold a stream;
- WebSocket only when bidirectional presence, typing or collaborative requirements justify the complexity;
- order updates can reuse the event-to-SSE projection where users are already subscribed;
- tenant and permission scope must be checked when opening a stream;
- reconnect uses `Last-Event-ID` or an equivalent cursor where durable replay is required. The current `since` timestamp and `created_at > cursor` query are not a durable replay guarantee when multiple rows share a timestamp; target a stable `(created_at, id)` cursor or event sequence with bounded replay.

## 15. Shared Contracts

`packages/contracts` should evolve by public domain and versioned boundary:

```text
packages/contracts/src/
├── common/
├── platform/
├── channels/
├── conversations/
├── customers/
├── ai/
├── commerce/
├── growth/
└── analytics/
```

Contracts contain API request/response schemas, canonical event envelopes, public enums and provider-neutral DTOs. They must not contain database row types, repository interfaces, secret material, Fastify request objects or provider-specific implementation internals unless the contract is explicitly provider-facing.

Add a breaking contract version rather than silently changing event meaning. Keep frontend and backend coupled to public semantics, not database implementation details.

## 16. Error Architecture

Target response shape:

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You do not have permission for this operation",
    "details": {},
    "requestId": "uuid"
  }
}
```

Standard categories:

`VALIDATION_ERROR`, `AUTHENTICATION_ERROR`, `PERMISSION_DENIED`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PROVIDER_ERROR`, `INTERNAL_ERROR`.

Domain errors should be typed and mapped once at the HTTP boundary. Provider errors should retain a safe provider code internally while exposing a stable platform code. Internal SQL, tokens and stack traces must not be sent to clients.

## 17. Observability

Every request, worker job, webhook and provider delivery should have a request/trace ID and workspace ID where applicable. Logs should include operation, module, aggregate ID, outcome, duration and retry count, but never access tokens, encrypted credential contents, passwords or full sensitive customer payloads.

Target metrics include API latency/error rate, webhook acceptance/normalization, Outbox age, delivery retry/dead-letter counts, queue depth, SSE connections, provider rate limits, conversation response time, order/payment failures and inventory reservation failures. Tracing should connect HTTP request → transaction → outbox event → worker → provider call.

## 18. Configuration Architecture

Configuration is server-owned and loaded from environment/secret management. `.env.example` remains a discoverable local template, not a production secret store.

- public frontend configuration: non-secret API origin and feature flags only;
- API configuration: database, auth, request limits, public URLs and safe operational settings;
- provider secrets: secret manager/runtime injection, never browser configuration;
- worker configuration: queue polling, retry and concurrency limits;
- migrations/config bootstrap: explicit operational entrypoints.

Configuration should be parsed and validated once at process startup. Fail closed for missing encryption/auth secrets in production.

## 19. Scalability Strategy

Do not prematurely design microservices. The target should first be a modular monolith with one API deployment, worker processes, PostgreSQL, Redis only where useful, and provider adapters.

- **10 workspaces:** validate the basic design with representative channel/message load, auth/error hardening and backup/recovery checks. No capacity guarantee follows from workspace count alone.
- **100 workspaces:** measure query latency, active connections, webhook rate, outbox lag and worker throughput; add indexes, cursor pagination, tenant-safe cache keys and concurrency controls where the measurements warrant them.
- **1,000+ workspaces:** use measured tenant skew and event volume to decide on workload partitioning, projections, connection pools and database partitioning. Workspace count is a planning scenario, not a threshold that automatically requires new infrastructure.
- **Many channel accounts:** isolate adapter rate limits, credential refresh, webhook dedupe and per-provider retry budgets.
- **Large message volume:** optimize Inbox indexes, Outbox claims, archive/read models and realtime fan-out; do not add Kafka solely because the architecture diagram contains events.
- **Large order volume:** separate transactional order/inventory paths from analytics reads and introduce reservation/idempotency controls.

Microservices become justified when a bounded domain has independent scaling, deployment, ownership, failure isolation or compliance needs that cannot be achieved inside the modular monolith. Extraction must follow stable contracts and event boundaries, not precede them.

## 20. Modular Monolith Strategy

Yes: the initial target should remain a modular monolith.

Modules communicate through public application services and versioned events. Each module owns its tables logically, even if all modules share one PostgreSQL database initially. Route registration, repositories, contracts and tests make ownership visible. A future service extraction can move a module behind its existing contract without first rewriting the entire product.

Avoid shared “god services”, direct cross-module SQL, and a single global domain model. Shared database infrastructure is acceptable; shared business ownership is not.

## 21. Target Data Flow — Omnichannel Message

### Inbound

```text
Facebook/Zalo/other provider
  → Integrations-owned webhook endpoint
  → signature/replay verification and webhook deduplication
  → provider adapter yields a provider-neutral inbound message
  → orchestration resolves/creates Customer identity through Customers public service
  → Conversation application service records conversation/message
  → PostgreSQL webhook receipt + customer identity + conversation/message + Outbox transaction
  → worker/event projection
  → SSE/realtime stream
  → Inbox frontend
```

### Outbound

```text
Inbox frontend
  → API + workspace permission
  → SendMessage application service
  → message + Outbox in one transaction
  → worker claims idempotently
  → Integrations' channel provider adapter
  → provider message ID/status
  → PostgreSQL + event
  → SSE/realtime update
```

## 22. Target Data Flow — Commerce

**FUTURE TARGET — not implemented:**

```text
Customer
  → create Order
  → authorize/capture Payment
  → reserve/decrement Inventory
  → create Shipment
  → update Customer timeline and Analytics projections
```

Each operation has its own idempotency and compensation policy. Payment and inventory state must not be inferred from a chat message alone.

## 23. Cross-Domain Customer Identity

There must be one workspace-scoped canonical `CustomerId`. Conversations, CRM, orders, marketing and loyalty reference it rather than defining separate incompatible customer records. **MIGRATION:** the existing `contacts.id` is the candidate to become that ID after a data/contract review; do not create a second Customer table by default. Keep old contact IDs stable if possible, then add profile/identity capabilities around them.

Target identity model:

```text
Customer
├── ContactPoint (email, phone, etc.)
├── ChannelIdentity (provider/account/external user ID)
├── Conversation references
├── Order references
├── Timeline entries
└── Segment / loyalty references
```

`ContactPoint` describes a reachable identity; `ChannelIdentity` describes an external provider identity; external IDs remain provider-scoped. Identity merge must be explicit, audited and safe against accidental cross-workspace linking.

The existing `contact_identities` uniqueness `(connection_id, external_user_id)` scopes an external identity to a connected account. Preserve that behavior while introducing a public Customers identity-link command. If multiple modules must write in one local transaction, an application service may coordinate their repositories with one unit of work; module ownership and workspace checks still apply.

## 24. Coding Ownership Rules

- Provider integration code belongs under integrations/adapters.
- SQL belongs behind the owning module's data-access boundary.
- HTTP routes do not contain large business flows.
- Business modules cannot read another module's private tables directly.
- Shared code must demonstrably be cross-domain; do not use `shared` as a dumping ground.
- Frontend UI primitives never call APIs or know provider credentials.
- Workspace scope and permission checks are mandatory for every business use case.
- Every background job is idempotent and records attempts/errors safely.
- Domain state transitions are explicit and audited where operationally important.
- Public contracts are versioned and provider-neutral where possible.

## 25. Adding a New Domain

1. Define the business responsibility and bounded context.
2. Identify canonical entities and workspace ownership.
3. Define permissions and actor/audit requirements.
4. Define public API and event contracts in `packages/contracts`.
5. Add migrations, indexes and repository boundaries.
6. Implement application services and domain invariants.
7. Expose thin API routes and consistent errors.
8. Add frontend feature/page composition using the shared shell and UI primitives.
9. Add events, worker jobs and idempotency behavior for side effects.
10. Add unit/integration/API/frontend tests and observability.
11. Update ADRs and this architecture document if a boundary changes.

## 26. Architecture Decision Records

Use `docs/adr/` for accepted decisions that affect multiple modules or future migrations. An ADR should state context, decision, alternatives, consequences, compatibility impact and migration status. Do not create an ADR for ordinary implementation details; do create one for choices such as frontend framework adoption, queue replacement, service extraction, identity provider, payment model or database partitioning.

## 27. Migration Plan From Current Architecture

### P0 — Document and enforce boundaries

**Goal:** make current ownership explicit and establish a verified risk baseline before adding domains.

**Current files affected:** `SYSTEM_ARCHITECTURE.md`, this document, `apps/api/src/server.ts`, `apps/api/src/auth.ts`, `apps/api/src/rbac.ts`, `apps/api/src/worker.ts`, `apps/api/src/webhook-store.ts`, `apps/api/src/provider.ts`, `apps/web/public/index.html`, `packages/contracts/src/index.ts` and `db/migrations/001_initial.sql`. These are future implementation touchpoints, not code changed by this review.

**New boundaries:** documented module ownership, event naming/versioning, workspace invariants and route conventions.

**Risk:** documentation can drift; the browser key, cross-workspace channel reconnect, unconsumed inbound Outbox and stranded `sending` jobs may remain unresolved unless tracked explicitly.

**Compatibility:** preserve current route paths and isolated local development workflow while keeping the demo API-key path out of production frontend; preserve existing data during tenant/event remediation.

**Exit criteria:** every existing route is mapped to a domain and has workspace/permission behavior identified; the verified risks above have characterization checks and planned owners; each existing Outbox event type has an identified consumer or an explicitly documented undelivered status.

### P1 — Frontend application foundation

**Goal:** extract the current inbox without changing its behavior.

**Current files affected:** `apps/web/public/index.html`, `apps/web/Dockerfile`, `apps/web/nginx.conf`.

**New boundaries:** app bootstrap, AppShell, layout regions, UI primitives, token stylesheet, inbox feature and API client. Select a frontend framework/build approach in an ADR before implementation; none is currently verified.

**Risk:** visual or interaction regressions.

**Compatibility:** preserve existing API endpoints, polling/SSE behavior, workspace headers and responsive shell.

**Exit criteria:** current inbox flows work with extracted components, responsive checks pass, and neither provider secrets nor the current local API key enter a production browser bundle.

### P2 — Split backend route orchestration

**Goal:** reduce `server.ts` responsibility without changing public APIs.

**Current files affected:** `apps/api/src/server.ts`, `db.ts`, `webhook-store.ts`, `worker.ts`, `provider.ts`.

**New boundaries:** platform, conversations, customers and integrations route/service modules; application services; repository interfaces/implementations. Preserve the webhook's atomic writes across module repositories through one application transaction.

**Risk:** transaction, error-status or workspace-scope regressions.

**Compatibility:** keep paths, envelopes, migration tables and provider behavior stable; add characterization tests first.

**Exit criteria:** route registration is composition-only; each moved use case has service/API tests; claimed Outbox jobs can be recovered after a crash and existing `message.received` events have an explicit delivery/retention policy.

### P3 — Conversations + Customers

**Goal:** formalize current Inbox domain and introduce one canonical customer identity boundary.

**Current files affected:** migrations 001–005, `server.ts`, `facebook-adapter.ts`, `webhook-store.ts`, `packages/contracts`.

**New boundaries:** Conversations owns message lifecycle; Customers owns identity linking around existing contacts where feasible; Integrations owns channel connections/credentials/webhook receipts; cross-domain references use stable Customer IDs and public commands/events.

**Risk:** duplicate contacts or changed webhook dedupe behavior.

**Compatibility:** preserve external message uniqueness and current Facebook normalization; backfill only with audited migrations.

**Exit criteria:** inbound/outbound tests pass, customer linking is workspace-safe, accidental Page transfer across workspaces is rejected or explicitly authorized, assignees belong to the workspace, and no conversation code owns a second customer model.

### P4 — AI and Automation

**Goal:** add AI and then Automation only when concrete product use cases are approved; keep them separate modules with explicit tools and events.

**Current files affected:** conversation services/contracts and new AI/automation modules.

**New boundaries:** AI consumes canonical messages and exposes commands; automation executes idempotent actions.

**Risk:** unsafe actions, stale AI sends, runaway workflows.

**Compatibility:** retain current human takeover/return-to-AI behavior; the current API checks a supplied `version` but permits omission, so define when optimistic version is mandatory before claiming stronger stale-action protection.

**Exit criteria:** guardrails, audit, permission model, retries and human handoff behavior are tested.

### P5 — Commerce foundation

**Goal:** introduce the smallest Commerce slice required by a validated product use case; products, orders, payments and inventory are separate ownership areas and need not all launch in one phase.

**Current files affected:** new commerce migrations/modules, contracts, API routes and frontend features.

**New boundaries:** Commerce owns order/inventory state; Customers supplies identity; Channels may import/export through adapters.

**Risk:** payment/idempotency and inventory consistency.

**Compatibility:** no changes to Inbox transaction ownership; customer timeline receives events asynchronously.

**Exit criteria:** order/payment/inventory invariants, idempotency and workspace isolation are proven in integration tests.

### P6 — Analytics and Growth

**Goal:** add only the Analytics/Growth slices justified by validated reporting or campaign use cases, after source events are stable.

**Current files affected:** new modules/projections, contracts, worker jobs and frontend routes.

**New boundaries:** Analytics is event-consuming/read-oriented; Growth owns campaign/promotion rules.

**Risk:** reporting inconsistency and high-volume projection lag.

**Compatibility:** transactional domains do not depend on analytics availability.

**Exit criteria:** replayable projections, metric definitions, tenant-safe reads and operational lag monitoring exist.

## 28. What NOT To Build Yet

- Microservices before module boundaries and independent scaling needs are proven.
- Kafka/Redpanda merely because events exist; PostgreSQL Outbox plus a worker is sufficient initially.
- Multiple databases or per-domain deployments without measured isolation needs.
- Full event sourcing when current transactional state plus durable events meets requirements.
- A second authentication mechanism beside the chosen identity boundary.
- A speculative CRM/commerce schema without an implemented use case.
- A frontend component framework migration without an ADR and an incremental inbox extraction plan.
- A global cache that does not encode workspace and permission scope.
- Provider-specific branches scattered through Conversations or Commerce.

## 29. Non-Negotiable Architecture Rules

1. Every business operation is workspace scoped.
2. Every protected operation performs permission enforcement server-side.
3. Provider credentials never reach frontend code, logs or public contracts.
4. Provider payloads are normalized at adapters.
5. Route handlers remain thin and do not become application-service replacements.
6. Business modules own their persistence access.
7. No direct cross-domain SQL into another module's private tables.
8. Cross-domain synchronous calls use public services; side effects use versioned events.
9. PostgreSQL remains the transactional source of truth until evidence supports a change.
10. Outbox writes share the transaction with the state change they describe.
11. Background jobs are idempotent, retryable and tenant-aware.
12. Mutating APIs use idempotency keys where retries can duplicate effects.
13. Shared contracts contain public semantics, not implementation details.
14. Frontend primitives contain no domain API calls.
15. New frontend pages reuse the AppShell and design tokens.
16. Do not create a second global state or styling system without an ADR.
17. Do not add a future domain solely as an empty folder or speculative schema.
18. Sensitive customer data is minimized in logs and events.
19. State transitions and operational handoffs are auditable.
20. Architecture changes that affect module ownership are documented in an ADR.

## 30. Final Target Architecture Diagram

```text
                           ┌──────────────────────────┐
                           │ Users / Browser Clients   │
                           └────────────┬─────────────┘
                                        │
                           ┌────────────▼─────────────┐
                           │ Web App                   │
                           │ AppShell + Design System  │
                           │ Features + API client     │
                           └────────────┬─────────────┘
                                        │ HTTPS/SSE
                           ┌────────────▼─────────────┐
                           │ Fastify API / BFF          │
                           │ auth • validation • errors │
                           │ request IDs • permissions  │
                           └────────────┬─────────────┘
                                        │
       ┌────────────────────────────────┼────────────────────────────────┐
       │                                │                                │
┌──────▼──────┐ ┌──────────────▼─────────────┐ ┌──────────────▼───────────┐
│ Platform    │ │ Customer Operations         │ │ AI & Automation           │
│ identity    │ │ Conversations + Customers  │ │ agents + workflows        │
│ workspace   │ │ channels + CRM             │ │ tools + guardrails        │
└──────┬──────┘ └──────────────┬─────────────┘ └──────────────┬───────────┘
       │                       │                              │
       └───────────────────────┼──────────────────────────────┘
                               │ public services/events
                    ┌──────────▼──────────┐  ┌─────────────────────┐
                    │ Commerce + Growth   │  │ Analytics            │
                    │ orders/inventory    │  │ projections/read     │
                    │ promotions/loyalty │  │ models only          │
                    └──────────┬──────────┘  └──────────┬──────────┘
                               │                        │ consumes
                    ┌──────────▼────────────────────────▼──────────┐
                    │ PostgreSQL transaction + Outbox               │
                    │ module-owned tables, migrations, repositories │
                    └──────────┬───────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Worker / Queue       │
                    │ retries, projections │
                    │ provider delivery    │
                    └──────┬───────┬──────┘
                           │       │
                 ┌─────────▼─┐ ┌───▼──────────┐
                 │ Redis/job  │ │ Provider      │
                 │ coordination│ │ adapters      │
                 └────────────┘ │ FB/IG/Zalo    │
                                │ WhatsApp/...  │
                                └──────┬────────┘
                                       │
                         External channels and services
```

This diagram is the target direction. The current repository is earlier in the migration: one Fastify server, one worker entrypoint, one static web page, PostgreSQL, configured Redis and a Facebook-focused provider path.

