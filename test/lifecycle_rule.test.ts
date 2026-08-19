import assert from "node:assert/strict";
import test from "node:test";
import { lifecycleDecision, objectKey } from "../src/property_lifecycle.js";

test("expires only recognized property objects at their encoded deadline", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");
  const expired = objectKey("maintenance_requests", "leak-42", new Date("2026-08-17T11:59:59.000Z"));
  const active = objectKey("inspection_reminders", "unit-7", new Date("2026-08-18T12:00:00.000Z"));

  assert.equal(lifecycleDecision(expired, now)?.action, "expire");
  assert.equal(lifecycleDecision(active, now)?.action, "keep");
  assert.equal(lifecycleDecision("leases/permanent.json", now), null);
});
