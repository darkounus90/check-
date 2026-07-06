import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AlertDispatcher,
  type AlertEvent,
  type AlertTransport,
  buildAlertTransportFromEnv,
  formatAlertText,
  LoggerAlertTransport,
  WebhookAlertTransport,
} from "../src/alerts.js";
import { createMemorySink, StructuredLogger } from "../src/logger.js";

const noSleep = async () => {};

function makeLogger() {
  const { sink, records } = createMemorySink();
  return { logger: new StructuredLogger({ sink }), records };
}

const sampleEvent: AlertEvent = {
  kind: "queue_stuck",
  severity: "warning",
  title: "Cola atascada: ocr-processing",
  context: { queue: "ocr-processing", waiting: 200 },
};

test("dispatch entrega el evento por el transporte (mock)", async () => {
  const sent: AlertEvent[] = [];
  const transport: AlertTransport = { name: "mock", send: async (e) => void sent.push(e) };
  const { logger } = makeLogger();
  const dispatcher = new AlertDispatcher({ transport, logger, sleep: noSleep });

  await dispatcher.dispatch(sampleEvent);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.title, sampleEvent.title);
});

test("reintenta ante fallo y termina entregando", async () => {
  let attempts = 0;
  const transport: AlertTransport = {
    name: "flaky",
    send: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("webhook 503");
    },
  };
  const { logger, records } = makeLogger();
  const dispatcher = new AlertDispatcher({ transport, logger, sleep: noSleep, maxAttempts: 3 });

  await dispatcher.dispatch(sampleEvent);

  assert.equal(attempts, 3, "reintenta hasta lograrlo");
  // Dos warnings de reintento, ningún error de agotamiento.
  assert.equal(records.filter((r) => r.level === "warn").length, 2);
  assert.equal(records.filter((r) => r.level === "error").length, 0);
});

test("agotados los reintentos, NO se silencia: loguea error con el evento", async () => {
  const transport: AlertTransport = {
    name: "down",
    send: async () => {
      throw new Error("webhook caído");
    },
  };
  const { logger, records } = makeLogger();
  const dispatcher = new AlertDispatcher({ transport, logger, sleep: noSleep, maxAttempts: 2 });

  await dispatcher.dispatch(sampleEvent);

  const errorLog = records.find((r) => r.level === "error");
  assert.ok(errorLog, "debe existir un log de error de agotamiento");
  assert.equal((errorLog?.context.alert as AlertEvent).title, sampleEvent.title);
});

test("dispatch nunca lanza aunque el transporte falle siempre", async () => {
  const transport: AlertTransport = {
    name: "down",
    send: async () => {
      throw new Error("nope");
    },
  };
  const { logger } = makeLogger();
  const dispatcher = new AlertDispatcher({ transport, logger, sleep: noSleep, maxAttempts: 1 });

  await assert.doesNotReject(dispatcher.dispatch(sampleEvent));
});

test("serializa múltiples eventos encolados en orden", async () => {
  const sent: string[] = [];
  const transport: AlertTransport = { name: "mock", send: async (e) => void sent.push(e.title) };
  const { logger } = makeLogger();
  const dispatcher = new AlertDispatcher({ transport, logger, sleep: noSleep });

  void dispatcher.dispatch({ ...sampleEvent, title: "a" });
  void dispatcher.dispatch({ ...sampleEvent, title: "b" });
  await dispatcher.flush();

  assert.deepEqual(sent, ["a", "b"]);
});

test("WebhookAlertTransport hace POST slack con { text } y lanza en no-2xx", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const okFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;

  const transport = new WebhookAlertTransport({ url: "https://hooks.slack/x", fetchFn: okFetch });
  await transport.send(sampleEvent);
  assert.equal(calls[0]?.url, "https://hooks.slack/x");
  assert.ok(typeof (calls[0]?.body as { text: string }).text === "string");

  const badFetch = (async () => ({ ok: false, status: 500 }) as Response) as unknown as typeof fetch;
  const failing = new WebhookAlertTransport({ url: "https://x", fetchFn: badFetch });
  await assert.rejects(failing.send(sampleEvent), /500/);
});

test("WebhookAlertTransport discord usa { content }", async () => {
  let body: unknown;
  const fetchFn = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return { ok: true, status: 204 } as Response;
  }) as unknown as typeof fetch;

  const transport = new WebhookAlertTransport({ url: "https://discord", style: "discord", fetchFn });
  await transport.send(sampleEvent);
  assert.ok(typeof (body as { content: string }).content === "string");
});

test("buildAlertTransportFromEnv: webhook si hay URL, logger si no", () => {
  const { logger } = makeLogger();
  const withUrl = buildAlertTransportFromEnv({ webhookUrl: "https://x" }, logger);
  assert.ok(withUrl instanceof WebhookAlertTransport);

  const without = buildAlertTransportFromEnv({ webhookUrl: undefined }, logger);
  assert.ok(without instanceof LoggerAlertTransport);
});

test("formatAlertText incluye severidad, tipo y contexto", () => {
  const text = formatAlertText(sampleEvent);
  assert.match(text, /WARNING/);
  assert.match(text, /queue_stuck/);
  assert.match(text, /waiting: 200/);
});
