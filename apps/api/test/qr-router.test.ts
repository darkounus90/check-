import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type AssignableHealth,
  type PoolAssignmentRow,
  resolveQr,
  toWaMeNumber,
  waMeUrl,
} from "../src/public/qr-router";

/**
 * Tests de la lógica PURA del enrutador de QR (Épica 8): selección sana (E08-T2), failover a
 * secundario (E08-T3), fallback a PWA (E08-T4) y continuidad en cadena (E08-T7). Sin I/O.
 */

/** Helper: mapa de salud a partir de pares [id, health]. */
function healthMap(entries: Array<[string, AssignableHealth]>) {
  const m = new Map(entries);
  return (id: string): AssignableHealth | undefined => m.get(id);
}

const A: PoolAssignmentRow = { waNumberId: "n-primario", priority: 10, createdAtMs: 1_000 };
const B: PoolAssignmentRow = { waNumberId: "n-secundario", priority: 5, createdAtMs: 2_000 };
const C: PoolAssignmentRow = { waNumberId: "n-terciario", priority: 5, createdAtMs: 3_000 };

// ── E08-T2: nunca resuelve a caído/baneado ──────────────────────

test("primario connected: resuelve al primario con reason PRIMARY", () => {
  const r = resolveQr([A, B], healthMap([["n-primario", "connected"], ["n-secundario", "connected"]]));
  assert.deepEqual(r, { action: "whatsapp", waNumberId: "n-primario", reason: "PRIMARY" });
});

test("nunca resuelve a un número banned o warming aunque sea el de mayor prioridad", () => {
  const banned = resolveQr([A, B], healthMap([["n-primario", "banned"], ["n-secundario", "connected"]]));
  assert.equal(banned.action, "whatsapp");
  assert.equal((banned as { waNumberId: string }).waNumberId, "n-secundario");

  const warming = resolveQr([A, B], healthMap([["n-primario", "warming"], ["n-secundario", "connected"]]));
  assert.equal((warming as { waNumberId: string }).waNumberId, "n-secundario");
});

test("prefiere connected sobre degraded aunque el degraded tenga mayor prioridad", () => {
  const r = resolveQr([A, B], healthMap([["n-primario", "degraded"], ["n-secundario", "connected"]]));
  // El primario está degraded; hay un connected más abajo → failover al connected.
  assert.deepEqual(r, { action: "whatsapp", waNumberId: "n-secundario", reason: "FAILOVER" });
});

test("acepta degraded como último recurso cuando ninguno está connected", () => {
  const r = resolveQr([A, B], healthMap([["n-primario", "degraded"], ["n-secundario", "banned"]]));
  assert.deepEqual(r, { action: "whatsapp", waNumberId: "n-primario", reason: "PRIMARY" });
});

// ── E08-T3: failover a secundario ───────────────────────────────

test("primario caído (banned): la resolución usa el secundario sano, reason FAILOVER", () => {
  const r = resolveQr([A, B], healthMap([["n-primario", "banned"], ["n-secundario", "connected"]]));
  assert.deepEqual(r, { action: "whatsapp", waNumberId: "n-secundario", reason: "FAILOVER" });
});

test("orden por prioridad desc; a igual prioridad gana la asignación más antigua", () => {
  // B y C tienen prioridad 5; B es más antigua (createdAtMs 2000 < 3000). Ambos connected.
  const r = resolveQr([C, B], healthMap([["n-secundario", "connected"], ["n-terciario", "connected"]]));
  assert.equal((r as { waNumberId: string }).waNumberId, "n-secundario");
});

test("primario caído y el siguiente por orden es el que se elige (no salta arbitrariamente)", () => {
  const r = resolveQr(
    [A, B, C],
    healthMap([
      ["n-primario", "banned"],
      ["n-secundario", "connected"],
      ["n-terciario", "connected"],
    ]),
  );
  assert.equal((r as { waNumberId: string }).waNumberId, "n-secundario");
  assert.equal((r as { reason: string }).reason, "FAILOVER");
});

// ── E08-T4: fallback a PWA ──────────────────────────────────────

test("sin asignaciones: fallback a PWA", () => {
  assert.deepEqual(resolveQr([], healthMap([])), { action: "pwa", reason: "FALLBACK_PWA" });
});

test("todo el pool caído (banned/warming): fallback a PWA", () => {
  const r = resolveQr([A, B], healthMap([["n-primario", "banned"], ["n-secundario", "warming"]]));
  assert.deepEqual(r, { action: "pwa", reason: "FALLBACK_PWA" });
});

test("números sin dato de salud (undefined) cuentan como no sanos → PWA", () => {
  const r = resolveQr([A], healthMap([]));
  assert.deepEqual(r, { action: "pwa", reason: "FALLBACK_PWA" });
});

// ── E08-T7: continuidad primario→secundario→PWA en cadena ───────

test("continuidad: caídas escalonadas siempre llegan a un canal funcional", () => {
  const assignments = [A, B];

  // 1) Todo sano → primario.
  let r = resolveQr(assignments, healthMap([["n-primario", "connected"], ["n-secundario", "connected"]]));
  assert.deepEqual(r, { action: "whatsapp", waNumberId: "n-primario", reason: "PRIMARY" });

  // 2) Cae el primario → secundario (failover transparente).
  r = resolveQr(assignments, healthMap([["n-primario", "banned"], ["n-secundario", "connected"]]));
  assert.deepEqual(r, { action: "whatsapp", waNumberId: "n-secundario", reason: "FAILOVER" });

  // 3) Cae también el secundario → PWA (cero downtime percibido).
  r = resolveQr(assignments, healthMap([["n-primario", "banned"], ["n-secundario", "banned"]]));
  assert.deepEqual(r, { action: "pwa", reason: "FALLBACK_PWA" });
});

// ── Normalización wa.me ─────────────────────────────────────────

test("toWaMeNumber: quita '+', espacios y guiones dejando solo dígitos", () => {
  assert.equal(toWaMeNumber("+57 300-111-2233"), "573001112233");
  assert.equal(toWaMeNumber("573001112233"), "573001112233");
});

test("waMeUrl: construye https://wa.me/<solo-digitos>", () => {
  assert.equal(waMeUrl("+573001112233"), "https://wa.me/573001112233");
});
