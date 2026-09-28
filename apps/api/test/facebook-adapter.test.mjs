import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFacebookMessages } from "../dist/facebook-adapter.js";

test("normalizes Facebook text message to canonical inbound shape", () => {
  const messages = normalizeFacebookMessages({
    object: "page",
    entry: [{
      id: "page-123",
      time: 1790308437,
      messaging: [{
        sender: { id: "customer-456" },
        recipient: { id: "page-123" },
        timestamp: 1790308437000,
        message: { mid: "mid.test.002", text: "hello" },
      }],
    }],
  });

  assert.deepEqual(messages[0], {
    externalMessageId: "mid.test.002",
    externalAccountId: "page-123",
    externalUserId: "customer-456",
    text: "hello",
    messageType: "text",
    occurredAt: "2026-09-25T03:53:57.000Z",
    metadata: { provider: "facebook_page", attachments: [] },
  });
});
