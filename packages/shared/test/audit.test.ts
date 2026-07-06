import assert from "node:assert/strict";
import { test } from "node:test";

import { Auditor, buildAuditEvent, createMemoryAuditSink } from "../src/audit.js";

test("buildAuditEvent normaliza con defaults y reloj inyectable", () => {
  const now = new Date("2026-07-06T10:00:00.000Z");
  const event = buildAuditEvent(
    { actorId: "user-1", resource: "voucher", action: "read", resourceId: "v-1" },
    () => now,
  );
  assert.equal(event.actorType, "user");
  assert.equal(event.businessId, null);
  assert.equal(event.resource, "voucher");
  assert.equal(event.resourceId, "v-1");
  assert.deepEqual(event.metadata, {});
  assert.equal(event.occurredAt, now.toISOString());
});

test("Auditor despacha eventos normalizados al sink", async () => {
  const now = new Date("2026-07-06T10:00:00.000Z");
  const { sink, events } = createMemoryAuditSink();
  const auditor = new Auditor(sink, () => now);

  await auditor.record({
    businessId: "b-1",
    actorId: "u-1",
    resource: "voucher_artifact",
    action: "decrypt",
    resourceId: "v-9",
    metadata: { ip: "1.2.3.4" },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].businessId, "b-1");
  assert.equal(events[0].action, "decrypt");
  assert.equal(events[0].metadata.ip, "1.2.3.4");
  assert.equal(events[0].occurredAt, now.toISOString());
});
