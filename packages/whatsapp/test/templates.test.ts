import assert from "node:assert/strict";
import { test } from "node:test";

import { ACK_TEMPLATE, renderVerdictMessage } from "../src/templates.js";

/**
 * Tests de selección de plantilla según veredicto (E07-T3). Grupo A usa una plantilla fija
 * por estado; la rotación anti-repetición llega en E07-T5.
 */

test("ACK_TEMPLATE es el acuse 🟡 de 'estamos verificando'", () => {
  assert.match(ACK_TEMPLATE, /🟡/);
  assert.match(ACK_TEMPLATE, /verificando/i);
});

test("renderVerdictMessage(VERIFIED) responde 🟢 'ya puedes entregar'", () => {
  const msg = renderVerdictMessage("VERIFIED");
  assert.match(msg, /🟢/);
  assert.match(msg, /entregar el pedido/i);
});

test("renderVerdictMessage(SUSPICIOUS) responde 🚨 'NO entregues'", () => {
  const msg = renderVerdictMessage("SUSPICIOUS");
  assert.match(msg, /🚨/);
  assert.match(msg, /NO entregues/);
});
