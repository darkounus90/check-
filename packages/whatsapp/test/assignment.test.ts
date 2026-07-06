import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type AssignableHealth,
  businessesForNumber,
  numberServesBusiness,
  numbersForBusiness,
  type PoolAssignment,
  pickHealthyNumberForBusiness,
} from "../src/assignment.js";

/**
 * Asignación multi-tenant número↔negocios (E07-T8): resolución negocio→números y
 * número→negocios, invariante de aislamiento, y selección del número sano para un negocio.
 */

const A: PoolAssignment[] = [
  { waNumberId: "wa-1", businessId: "biz-a", priority: 10, createdAtMs: 1_000 },
  { waNumberId: "wa-2", businessId: "biz-a", priority: 20, createdAtMs: 2_000 },
  { waNumberId: "wa-3", businessId: "biz-a", priority: 20, createdAtMs: 500 }, // empate prioridad
  { waNumberId: "wa-1", businessId: "biz-b", priority: 5, createdAtMs: 3_000 },
];

test("numbersForBusiness: ordena por prioridad desc y desempata por antigüedad (E07-T8)", () => {
  // biz-a: wa-3 y wa-2 tienen prioridad 20 (wa-3 más antiguo gana), luego wa-1 (prioridad 10).
  assert.deepEqual(numbersForBusiness(A, "biz-a"), ["wa-3", "wa-2", "wa-1"]);
  assert.deepEqual(numbersForBusiness(A, "biz-b"), ["wa-1"]);
  assert.deepEqual(numbersForBusiness(A, "biz-sin-asignar"), []);
});

test("businessesForNumber: enumera el radio de daño de un número (E07-T8)", () => {
  assert.deepEqual(businessesForNumber(A, "wa-1"), ["biz-a", "biz-b"]);
  assert.deepEqual(businessesForNumber(A, "wa-2"), ["biz-a"]);
  assert.deepEqual(businessesForNumber(A, "wa-huerfano"), []);
});

test("numberServesBusiness: invariante de aislamiento — ningún número fuera de su asignación", () => {
  assert.equal(numberServesBusiness(A, "wa-1", "biz-a"), true);
  assert.equal(numberServesBusiness(A, "wa-2", "biz-b"), false, "wa-2 NO sirve a biz-b");
  assert.equal(numberServesBusiness(A, "wa-3", "biz-b"), false);
});

test("pickHealthyNumberForBusiness: elige el connected preferente, nunca fuera del grupo", () => {
  const health = new Map<string, AssignableHealth>([
    ["wa-3", "banned"], // preferido por orden pero baneado ⇒ se salta
    ["wa-2", "connected"],
    ["wa-1", "connected"],
  ]);
  const picked = pickHealthyNumberForBusiness(A, "biz-a", (id) => health.get(id));
  assert.equal(picked, "wa-2", "salta el baneado y toma el siguiente connected por preferencia");
});

test("pickHealthyNumberForBusiness: cae a degraded si no hay connected", () => {
  const health = new Map<string, AssignableHealth>([
    ["wa-3", "banned"],
    ["wa-2", "warming"],
    ["wa-1", "degraded"],
  ]);
  const picked = pickHealthyNumberForBusiness(A, "biz-a", (id) => health.get(id));
  assert.equal(picked, "wa-1", "degraded reconectando es aceptable si no hay connected");
});

test("pickHealthyNumberForBusiness: null si todos baneados/warming (radio de daño acotado)", () => {
  const health = new Map<string, AssignableHealth>([
    ["wa-3", "banned"],
    ["wa-2", "banned"],
    ["wa-1", "warming"],
  ]);
  assert.equal(
    pickHealthyNumberForBusiness(A, "biz-a", (id) => health.get(id)),
    null,
  );
});
