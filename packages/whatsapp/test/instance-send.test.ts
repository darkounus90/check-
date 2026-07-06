import assert from "node:assert/strict";
import { test } from "node:test";

import { WhatsAppInstance, type WhatsAppInstanceDeps } from "../src/instance.js";
import { TEMPLATES } from "../src/templates.js";
import type {
  TemplateKindKey,
  WarmupStateSnapshot,
} from "../src/types.js";
import { WARMUP_HOURLY_LIMITS } from "../src/warmup.js";

/**
 * Integración del `sendMessage` central (E07-T4/T5/T6): verifica que un envío pasa por
 * humanización (presencia + delay con reloj/sleep fijos), rota plantilla sin repetir, y
 * respeta el límite de warmeo. Se inyecta un socket fake (seam `setSocketForTest`) y los
 * stores en memoria; nada de Baileys/BD reales.
 */

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 6, 1, 15, 0, 0); // 10:00 en Bogotá (UTC-5): dentro de horario

interface FakeSocketCalls {
  presence: string[];
  reads: number;
  sent: string[];
}

function fakeSocket(): {
  socket: Parameters<WhatsAppInstance["setSocketForTest"]>[0];
  calls: FakeSocketCalls;
} {
  const calls: FakeSocketCalls = { presence: [], reads: 0, sent: [] };
  return {
    calls,
    socket: {
      sendPresenceUpdate: (async (p: string) => {
        calls.presence.push(p);
      }) as never,
      readMessages: (async () => {
        calls.reads += 1;
      }) as never,
      sendMessage: (async (_to: string, content: { text: string }) => {
        calls.sent.push(content.text);
        return {} as never;
      }) as never,
    },
  };
}

/** Store de rotación en memoria (E07-T5). */
function rotationStore(): {
  store: NonNullable<WhatsAppInstanceDeps["templateRotation"]>;
  state: Map<string, number>;
} {
  const state = new Map<string, number>();
  return {
    state,
    store: {
      getLastTemplateIndex: async (waNumberId: string, kind: TemplateKindKey) =>
        state.get(`${waNumberId}:${kind}`) ?? null,
      setLastTemplateIndex: async (waNumberId: string, kind: TemplateKindKey, index: number) => {
        state.set(`${waNumberId}:${kind}`, index);
      },
    },
  };
}

/** Store de warmeo en memoria (E07-T6). */
function warmupStore(initial: WarmupStateSnapshot): {
  store: NonNullable<WhatsAppInstanceDeps["warmup"]>;
  current: () => WarmupStateSnapshot;
} {
  let snap = initial;
  return {
    current: () => snap,
    store: {
      getWarmupState: async () => snap,
      saveWarmupState: async (_id: string, s: WarmupStateSnapshot) => {
        snap = s;
      },
    },
  };
}

/** Deps mínimas: solo lo que el pipeline de envío toca (los demás puertos no se usan aquí). */
function baseDeps(overrides: Partial<WhatsAppInstanceDeps>): WhatsAppInstanceDeps {
  const unused = () => {
    throw new Error("puerto no usado en este test");
  };
  return {
    waNumberId: "wa-1",
    sessionStore: { loadAuthState: unused as never, saveAuthState: unused as never },
    businessResolver: { resolveBusinessId: unused as never },
    storage: { uploadVoucher: unused as never },
    ingestStore: { createVoucher: unused as never, saveVoucherContext: unused as never },
    ocrEnqueuer: { enqueueVoucherOcr: unused as never },
    contextReader: { getVoucherContext: unused as never },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    humanizer: {
      clock: () => T0,
      random: () => 0.5,
      sleep: () => Promise.resolve(),
      businessHours: { startHour: 8, endHour: 20, utcOffsetMinutes: -300 },
    },
    ...overrides,
  };
}

test("sendMessage emite composing→paused y entrega (humanización E07-T4)", async () => {
  const { socket, calls } = fakeSocket();
  const instance = new WhatsAppInstance(baseDeps({}));
  instance.setSocketForTest(socket);

  const sent = await instance.sendMessage("57300@s.whatsapp.net", "hola");

  assert.equal(sent, true);
  assert.deepEqual(calls.presence, ["composing", "paused"]);
  assert.deepEqual(calls.sent, ["hola"]);
});

test("sendMessage fuera de horario NO envía (E07-T4)", async () => {
  const { socket, calls } = fakeSocket();
  const nightClock = Date.UTC(2026, 6, 1, 6, 0, 0); // 01:00 Bogotá
  const instance = new WhatsAppInstance(
    baseDeps({
      humanizer: {
        clock: () => nightClock,
        random: () => 0.5,
        sleep: () => Promise.resolve(),
        businessHours: { startHour: 8, endHour: 20, utcOffsetMinutes: -300 },
      },
    }),
  );
  instance.setSocketForTest(socket);

  const sent = await instance.sendMessage("57300@s.whatsapp.net", "hola");

  assert.equal(sent, false);
  assert.deepEqual(calls.sent, [], "no debe enviar fuera de horario");
});

test("sendVerdict rota plantilla y no repite consecutivo del mismo tipo (E07-T5)", async () => {
  const { socket, calls } = fakeSocket();
  const rot = rotationStore();
  const instance = new WhatsAppInstance(
    baseDeps({
      templateRotation: rot.store,
      contextReader: {
        getVoucherContext: async () => ({ remoteJid: "57300@s.whatsapp.net", waNumberId: "wa-1" }),
      },
    }),
  );
  instance.setSocketForTest(socket);

  await instance.sendVerdict("v1", "VERIFIED");
  await instance.sendVerdict("v2", "VERIFIED");
  await instance.sendVerdict("v3", "VERIFIED");

  assert.equal(calls.sent.length, 3);
  // Ninguna respuesta consecutiva del mismo tipo es idéntica.
  assert.notEqual(calls.sent[0], calls.sent[1]);
  assert.notEqual(calls.sent[1], calls.sent[2]);
  // Y todas son variantes válidas del tipo `verified`.
  for (const text of calls.sent) assert.ok(TEMPLATES.verified.includes(text));
});

test("sendMessage respeta el tope de warmeo del número (E07-T6)", async () => {
  const { socket, calls } = fakeSocket();
  // Número en día 1 (alta en T0 - 1h): límite 20/h, ya con 20 enviados esta ventana.
  const wm = warmupStore({
    warmupStartedAtMs: T0 - HOUR,
    hourWindowStartMs: T0 - 60_000, // ventana vigente (hace 1 min)
    sentInWindow: WARMUP_HOURLY_LIMITS.day1,
  });
  const instance = new WhatsAppInstance(baseDeps({ warmup: wm.store }));
  instance.setSocketForTest(socket);

  const sent = await instance.sendMessage("57300@s.whatsapp.net", "hola");

  assert.equal(sent, false, "no debe enviar si alcanzó el tope horario de warmeo");
  assert.deepEqual(calls.sent, []);
});

test("sendMessage registra el envío en el warmeo cuando sí envía (E07-T6)", async () => {
  const { socket } = fakeSocket();
  const wm = warmupStore({
    warmupStartedAtMs: T0 - HOUR,
    hourWindowStartMs: null,
    sentInWindow: 0,
  });
  const instance = new WhatsAppInstance(baseDeps({ warmup: wm.store }));
  instance.setSocketForTest(socket);

  await instance.sendMessage("57300@s.whatsapp.net", "hola");

  assert.equal(wm.current().sentInWindow, 1, "el envío quedó contabilizado en la ventana");
  assert.equal(wm.current().hourWindowStartMs, T0);
});
