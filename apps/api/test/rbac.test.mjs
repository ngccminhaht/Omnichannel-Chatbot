import assert from "node:assert/strict";
import test from "node:test";
import { can, assertPermission } from "../dist/rbac.js";

test("RBAC permits agent replies but prevents channel management", () => {
  assert.equal(can("agent", "conversation:reply"), true);
  assert.equal(can("agent", "channel:manage"), false);
  assert.throws(() => assertPermission("agent", "channel:manage"), /Permission denied/);
});

test("supervisor can assign but cannot manage workspace", () => {
  assert.equal(can("supervisor", "conversation:assign"), true);
  assert.equal(can("supervisor", "workspace:manage"), false);
});
