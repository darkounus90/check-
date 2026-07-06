import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildConsentRecord,
  PRIVACY_NOTICE_TEXT,
  PRIVACY_NOTICE_VERSION,
} from "../src/consent.js";

test("buildConsentRecord usa la versión vigente y el reloj inyectable", () => {
  const now = new Date("2026-07-06T09:00:00.000Z");
  const record = buildConsentRecord(
    { businessId: "b-1", channel: "pwa", subjectRef: "ip:1.2.3.4" },
    () => now,
  );
  assert.equal(record.channel, "pwa");
  assert.equal(record.subjectRef, "ip:1.2.3.4");
  assert.equal(record.noticeVersion, PRIVACY_NOTICE_VERSION);
  assert.equal(record.acceptedAt, now.toISOString());
});

test("el aviso de privacidad menciona la finalidad y la ley colombiana", () => {
  assert.match(PRIVACY_NOTICE_TEXT, /verificar/i);
  assert.match(PRIVACY_NOTICE_TEXT, /1581/);
});
