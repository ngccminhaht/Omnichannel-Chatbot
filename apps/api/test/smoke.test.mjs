import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.META_APP_SECRET = "test-secret";
const { app } = await import("../dist/server.js");

test("health endpoint", async () => {
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok", service: "chat2-api" });
});

test("facebook webhook rejects unsigned payload", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/webhooks/facebook/connection-1",
    payload: { object: "page", entry: [] },
  });
  assert.equal(response.statusCode, 401);
});
