import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type BusinessHours,
  Humanizer,
  type HumanizerEffects,
  isWithinBusinessHours,
  localHourOf,
} from "../src/humanizer.js";

/**
 * Tests de la humanización anti-baneo (E07-T4). Reloj/aleatoriedad/sleep INYECTADOS para
 * verificar deterministamente que: hay presencia "escribiendo…", el delay es 1–4s y se
 * espera, se marca leído con delay, y fuera de horario NO se envía. Nunca se usa
 * Date.now()/Math.random()/setTimeout reales.
 */

/** Reloj fijo. */
function fixedClock(ms: number): () => number {
  return () => ms;
}

/** `sleep` fake que registra cada espera solicitada (sin bloquear tiempo real). */
function recordingSleep(): { sleep: (ms: number) => Promise<void>; waits: number[] } {
  const waits: number[] = [];
  return {
    waits,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  };
}

/** Efectos que registran la secuencia de acciones sobre el "socket". */
function recordingEffects(): {
  effects: HumanizerEffects;
  log: string[];
} {
  const log: string[] = [];
  return {
    log,
    effects: {
      setPresence: async (to, presence) => {
        log.push(`presence:${presence}:${to}`);
      },
      markRead: async (to) => {
        log.push(`read:${to}`);
      },
      deliver: async (to, body) => {
        log.push(`deliver:${to}:${body}`);
      },
    },
  };
}

// Epoch fijo dentro del horario laboral en Bogotá (UTC-5): 2026-07-06 15:00 UTC = 10:00 local.
const NOON_BOGOTA = Date.UTC(2026, 6, 6, 15, 0, 0);
// Epoch fijo de madrugada en Bogotá: 2026-07-06 06:00 UTC = 01:00 local.
const NIGHT_BOGOTA = Date.UTC(2026, 6, 6, 6, 0, 0);

const OFFICE_HOURS: BusinessHours = { startHour: 8, endHour: 20, utcOffsetMinutes: -300 };

test("localHourOf convierte epoch a hora local con offset", () => {
  assert.equal(localHourOf(NOON_BOGOTA, -300), 10);
  assert.equal(localHourOf(NIGHT_BOGOTA, -300), 1);
});

test("isWithinBusinessHours: dentro/fuera de una ventana normal", () => {
  assert.equal(isWithinBusinessHours(NOON_BOGOTA, OFFICE_HOURS), true);
  assert.equal(isWithinBusinessHours(NIGHT_BOGOTA, OFFICE_HOURS), false);
});

test("isWithinBusinessHours: sin config configurada es 24/7", () => {
  assert.equal(isWithinBusinessHours(NIGHT_BOGOTA, undefined), true);
});

test("isWithinBusinessHours: ventana que cruza medianoche (20→6)", () => {
  const overnight: BusinessHours = { startHour: 20, endHour: 6, utcOffsetMinutes: -300 };
  assert.equal(isWithinBusinessHours(NIGHT_BOGOTA, overnight), true); // 01:00 local
  assert.equal(isWithinBusinessHours(NOON_BOGOTA, overnight), false); // 10:00 local
});

test("pickSendDelayMs deriva el delay 1–4s de la aleatoriedad inyectada", () => {
  const mk = (r: number) =>
    new Humanizer({ clock: fixedClock(NOON_BOGOTA), random: () => r, sleep: () => Promise.resolve() });
  assert.equal(mk(0).pickSendDelayMs(), 1000); // mínimo
  assert.equal(mk(1).pickSendDelayMs(), 4000); // máximo
  assert.equal(mk(0.5).pickSendDelayMs(), 2500); // medio
});

test("send: emite composing → espera delay → paused → entrega (dentro de horario)", async () => {
  const { sleep, waits } = recordingSleep();
  const { effects, log } = recordingEffects();
  const humanizer = new Humanizer({
    clock: fixedClock(NOON_BOGOTA),
    random: () => 0.5,
    sleep,
    businessHours: OFFICE_HOURS,
  });

  const sent = await humanizer.send("57300@s.whatsapp.net", "hola", effects);

  assert.equal(sent, true);
  assert.deepEqual(log, [
    "presence:composing:57300@s.whatsapp.net",
    "presence:paused:57300@s.whatsapp.net",
    "deliver:57300@s.whatsapp.net:hola",
  ]);
  // Esperó exactamente el delay de envío (0.5 ⇒ 2500ms) entre composing y la entrega.
  assert.deepEqual(waits, [2500]);
});

test("send: fuera de horario NO envía ni marca presencia (devuelve false)", async () => {
  const { sleep, waits } = recordingSleep();
  const { effects, log } = recordingEffects();
  const humanizer = new Humanizer({
    clock: fixedClock(NIGHT_BOGOTA),
    random: () => 0.5,
    sleep,
    businessHours: OFFICE_HOURS,
  });

  const sent = await humanizer.send("57300@s.whatsapp.net", "hola", effects);

  assert.equal(sent, false);
  assert.deepEqual(log, [], "no debe haber presencia ni entrega fuera de horario");
  assert.deepEqual(waits, [], "no debe esperar delay si no envía");
});

test("markReadHumanized: espera el readDelay y marca leído", async () => {
  const { sleep, waits } = recordingSleep();
  const { effects, log } = recordingEffects();
  const humanizer = new Humanizer({
    clock: fixedClock(NOON_BOGOTA),
    random: () => 0.5,
    sleep,
    timing: { readDelayMs: 750 },
  });

  await humanizer.markReadHumanized("57300@s.whatsapp.net", effects);

  assert.deepEqual(waits, [750]);
  assert.deepEqual(log, ["read:57300@s.whatsapp.net"]);
});
