# chat2 Platform Design v1.1

## 1. Mục tiêu và phạm vi

chat2 là nền tảng quản lý hội thoại đa kênh độc lập với Oriagent. chat2 sở hữu workspace, channel connection, contact, conversation, message, assignment, handoff và trạng thái gửi tin. Oriagent chỉ là agent runtime tùy chọn được gọi qua contract versioned.

MVP triển khai theo một vertical slice hoàn chỉnh:

```text
Facebook Page
→ Webhook đã xác thực
→ PostgreSQL Inbox
→ Contact/Conversation/Message
→ Outbox
→ Agent Inbox API
→ Gửi text ngược về Facebook
```

Zalo OA được triển khai sau khi contract provider-neutral và lifecycle outbound của Facebook ổn định.

Ngoài MVP: Facebook cá nhân không chính thức, campaign/broadcast, CRM đầy đủ, voice/video, billing, marketplace và sentiment nâng cao.

## 2. Quyết định kiến trúc

| Hạng mục | Lựa chọn MVP | Lý do |
|---|---|---|
| Runtime | Node.js + TypeScript | Một ngôn ngữ cho API, worker và contract |
| HTTP | Fastify | Nhẹ, schema-friendly, phù hợp webhook |
| Database | PostgreSQL | Source of truth và transaction Inbox/Outbox |
| Queue/cache | Redis | Queue, cache và realtime fan-out; không lưu dữ liệu gốc |
| Event delivery | PostgreSQL Inbox/Outbox + worker | Đơn giản, durable, dễ replay |
| Realtime | SSE | MVP chỉ cần server-to-client events |
| Provider đầu tiên | Facebook Page | Có use case rõ và kiểm thử end-to-end trước |
| Provider thứ hai | Zalo OA | Adapter độc lập sau Facebook |
| API contract | REST `/api/v1` + JSON Schema | Versioning rõ ràng |
| Deployment | Docker Compose local, container production | Đồng nhất môi trường |

Kafka/Redpanda, search engine và WebSocket chỉ được thêm khi có số liệu throughput hoặc tính năng bắt buộc.

## 3. Bounded contexts

```text
Identity/Workspace
  └── User, Workspace, Membership, Permission

Channel
  └── Connection, Credential, Provider Adapter, Webhook

Inbox
  └── Contact, Identity, Conversation, Message, Attachment

Human Operations
  └── Assignment, Handoff, Internal Note, Tag, Audit

Delivery
  └── Outbox, Provider Send, Retry, Delivery Status, Dead Letter

Integration
  └── Oriagent Connection, Event Delivery, Action Handling
```

Channel adapter không gọi trực tiếp adapter khác hoặc domain service của Oriagent.

## 4. Luồng dữ liệu bất biến

### 4.1 Inbound webhook

```text
Provider webhook
→ verify signature/replay protection
→ ghi webhook_events (Inbox) trong transaction
→ normalize thành canonical event
→ upsert contact/conversation/message
→ ghi outbox_events trong cùng transaction
→ trả 200
→ worker phát realtime và gửi Oriagent
```

Provider chỉ được nhận HTTP 200 sau khi event đã được lưu durable. Event duplicate không tạo thêm message.

### 4.2 Outbound message

```text
API/AI action
→ validate tenant + permission + handoff state
→ tạo message queued + outbox event trong transaction
→ worker claim event
→ provider adapter gửi message
→ lưu provider_message_id/status
→ retry lỗi tạm thời hoặc dead-letter lỗi cố định
```

Mỗi outbound request bắt buộc có platform idempotency key. Provider message ID là một định danh khác.

## 5. Canonical event contract

Mọi event dùng schema sau:

```json
{
  "event_id": "uuid",
  "event_type": "message.received",
  "event_version": "2026-09-01",
  "provider": "facebook_page",
  "workspace_id": "uuid",
  "connection_id": "uuid",
  "conversation_id": "uuid",
  "occurred_at": "2026-09-25T10:00:00Z",
  "trace_id": "uuid",
  "payload": {}
}
```

Event MVP:

```text
message.received
message.sent
message.delivered
message.failed
conversation.updated
assignment.changed
handoff.changed
```

Event consumer phải idempotent theo `event_id`. Event version chỉ được tăng khi có breaking change.

## 6. Database model

```text
users
workspaces
workspace_members
channel_connections
channel_credentials
webhook_events
contacts
contact_identities
conversations
conversation_assignments
messages
message_attachments
outbox_events
integration_connections
integration_events
audit_logs
```

Quy tắc:

- Mọi entity thuộc tenant phải có `workspace_id` hoặc truy ra được qua entity có `workspace_id`.
- Mọi query tenant phải dùng workspace lấy từ session, không tin workspace ID tùy ý từ client.
- Credentials được mã hóa, không lưu plaintext hoặc log plaintext.
- Inbound unique key: `(connection_id, external_message_id)`.
- Webhook unique key: `(provider, connection_id, external_event_id)`.
- Outbox có `attempts`, `available_at`, `published_at`, `last_error`.
- Conversation và message có `created_at`, `updated_at`; conversation có `version`.

## 7. Conversation state machine

Conversation state:

```text
OPEN → PENDING → CLOSED
OPEN → SPAM
PENDING → OPEN
```

Handling mode:

```text
AI → HUMAN       agent takeover hoặc agent gửi tin
HUMAN → AI       return-to-ai hợp lệ
AI/HUMAN → PAUSED
PAUSED → AI/HUMAN
```

Invariant:

1. Agent gửi tin phải chuyển mode sang HUMAN trong cùng transaction.
2. AI action đã stale không được gửi nếu version/handoff state đã thay đổi.
3. Conversation lock có TTL và không thay thế optimistic locking.
4. Mọi transition ghi audit event.

## 8. API contract

Public API có prefix `/api/v1` và dùng cursor pagination.

```text
POST /api/v1/workspaces
GET  /api/v1/workspaces

GET  /api/v1/workspaces/{workspace_id}/channels
POST /api/v1/workspaces/{workspace_id}/channels/{provider}/oauth/start
GET  /api/v1/oauth/{provider}/callback

GET  /api/v1/conversations
GET  /api/v1/conversations/{id}
GET  /api/v1/conversations/{id}/messages
POST /api/v1/conversations/{id}/messages
POST /api/v1/conversations/{id}/assign
POST /api/v1/conversations/{id}/takeover
POST /api/v1/conversations/{id}/return-to-ai
POST /api/v1/conversations/{id}/close

GET  /api/v1/realtime
```

Request gửi tin bắt buộc có `Idempotency-Key`. Response lỗi chuẩn:

```json
{
  "error": {
    "code": "MESSAGE_SEND_WINDOW_EXPIRED",
    "message": "Provider rejected this message",
    "request_id": "uuid"
  }
}
```

## 9. Provider adapter contract

```text
verifyWebhook(request): boolean
parseWebhook(payload): ProviderEvent[]
normalizeEvent(event): CanonicalEvent[]
sendMessage(message, credentials): ProviderSendResult
refreshCredential(credentials): CredentialResult
subscribeWebhook(connection): void
healthCheck(connection): ProviderHealth
```

Facebook và Zalo không dùng chung logic token, payload, rate limit hoặc error mapping.

## 10. Oriagent Bridge contract

chat2 gọi Oriagent qua integration riêng, không import code hoặc database của Oriagent.

Mỗi delivery có:

- `event_id` và `Idempotency-Key`.
- `integration_id`.
- `trace_id`.
- Timeout và retry bounded.
- Circuit breaker.
- Dead-letter.
- Action ID và action expiry.
- Kiểm tra conversation version trước khi thực hiện AI action.

Tắt Oriagent integration không được làm hỏng human Inbox.

## 11. Security

- OAuth state + PKCE + callback replay protection.
- Verify webhook signature trên raw body.
- Replay protection bằng external event ID và timestamp nếu provider hỗ trợ.
- RBAC ở API, SSE và worker.
- Tenant isolation trong repository/query.
- Credential encryption bằng key quản lý riêng theo môi trường.
- Không log access token, refresh token hoặc message PII không cần thiết.
- Rate limit inbound/outbound và giới hạn payload size.
- Audit append-only cho connect, disconnect, send, takeover, permission change.
- Data retention, customer deletion và backup encryption.

## 12. Observability và vận hành

MVP phải có:

- `request_id`, `trace_id`, `workspace_id`, `conversation_id` trong log có mask PII.
- Metrics: webhook latency, webhook error rate, queue lag, send latency, retry count, DLQ size.
- Health: liveness, readiness, PostgreSQL, Redis.
- PostgreSQL backup/restore runbook.
- Replay webhook/event runbook.
- SLO: 95% inbound event hiển thị trong Inbox dưới 3 giây; 99% webhook được durable trước HTTP 200 dưới 500ms.

## 13. Deployment

Local:

```text
chat2-web → nginx
chat2-api → REST/webhook/SSE
chat2-worker → outbox/integration/provider delivery
postgres
redis
```

Production cần thêm object storage, ingress TLS, secret manager, monitoring và backup. Migration chạy trước API readiness; không chạy migration đồng thời không có lock.

## 14. Definition of Done MVP

- Workspace và member được tạo, kiểm tra được RBAC.
- Một Facebook Page connect được bằng OAuth.
- Webhook signature hợp lệ được lưu durable.
- Duplicate webhook không tạo duplicate message.
- Contact/conversation/message được tạo đúng tenant.
- Agent xem và gửi text từ Inbox.
- Outbound retry không gửi trùng.
- AI/Human transition đúng state machine.
- Oriagent có thể tắt riêng.
- Token không xuất hiện trong log/plaintext database.
- Workspace A không đọc được dữ liệu workspace B.
- `npm test`, migration test và Docker smoke test pass.

## 15. Trình tự implement

```text
Phase 0: contract, migration, config, observability
Phase 1: workspace/RBAC, PostgreSQL Inbox/Outbox, core Inbox API
Phase 2: Facebook normalization + outbound text
Phase 3: SSE + web Inbox
Phase 4: Oriagent Bridge + AI/Human handoff
Phase 5: Zalo OA
Phase 6: attachments, search, SLA, production hardening
```

## 16. Facebook Page connection - triển khai thực tế

### 16.1 Luồng kết nối

```text
Agent có quyền channel:manage
  → GET /api/v1/workspaces/{workspaceId}/channels/facebook_page/oauth/start
  → Meta OAuth dialog
  → GET /api/v1/oauth/facebook_page/callback?code=...&state=...
  → đổi code lấy user token
  → lấy danh sách Page và Page access token
  → subscribe từng Page vào App
  → mã hóa token bằng CHAT2_CREDENTIAL_KEY
  → upsert channel_connections
```

`state` được hash trong database, chỉ dùng một lần và hết hạn sau 10 phút. Token Facebook không trả về browser và không ghi plaintext vào database/log.

### 16.2 Webhook Meta

Callback URL phải là một URL tĩnh ở cấp Meta App:

```text
GET  /webhooks/facebook       # verify hub.mode, hub.verify_token, hub.challenge
POST /webhooks/facebook       # verify x-hub-signature-256, resolve Page ID → connection
```

Không dùng connection ID động làm callback URL chính, vì Meta App cần một URL cố định. Endpoint `/webhooks/facebook/{connectionId}` vẫn được giữ để tương thích test nội bộ. Payload được lưu Inbox với hash dedupe trước khi tạo contact, conversation và message.

### 16.3 Environment production

```text
META_APP_ID=<Meta App ID>
META_APP_SECRET=<Meta App Secret>
META_REDIRECT_URI=https://api.example.com/api/v1/oauth/facebook_page/callback
META_WEBHOOK_BASE_URL=https://api.example.com
META_WEBHOOK_VERIFY_TOKEN=<random secret>
META_OAUTH_SCOPES=pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging
CHAT2_PROVIDER_MODE=facebook
CHAT2_CREDENTIAL_KEY=<base64 của đúng 32 bytes>
```

Meta App phải khai báo OAuth redirect URI và webhook callback URL tương ứng, bật sản phẩm Messenger/Webhooks, đồng thời hoàn tất App Review/Business Verification cho các permission cần dùng. Local mock chỉ dùng để kiểm thử pipeline; không dùng credential giả khi triển khai thật.

### 16.4 API quản trị connection

```text
GET  /api/v1/workspaces/{workspaceId}/channels
GET  /api/v1/channels/{channelId}/health
POST /api/v1/channels/{channelId}/disconnect
```

Health check gọi Graph API bằng Page token đã giải mã trong memory; disconnect unsubscribe Page rồi đánh dấu connection `revoked`. Các lỗi Graph API được ghi audit/log có mã lỗi, không ghi access token.
