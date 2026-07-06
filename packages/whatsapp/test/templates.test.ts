import assert from "node:assert/strict";
import { test } from "node:test";

import {
  pickTemplate,
  TEMPLATES,
  type TemplateKind,
  templateKindForVerdict,
} from "../src/templates.js";

/**
 * Tests de la rotación de plantillas (E07-T5). Propiedad crítica del criterio de aceptación:
 * dos respuestas consecutivas del mismo tipo NUNCA son idénticas.
 */

const KINDS: TemplateKind[] = ["ack", "verified", "suspicious"];

test("cada tipo tiene entre 5 y 8 variantes (E07-T5)", () => {
  for (const kind of KINDS) {
    const n = TEMPLATES[kind].length;
    assert.ok(n >= 5 && n <= 8, `${kind} tiene ${n} variantes (esperado 5–8)`);
  }
});

test("cada variante abre con el emoji semáforo correcto", () => {
  for (const t of TEMPLATES.ack) assert.match(t, /^🟡/);
  for (const t of TEMPLATES.verified) assert.match(t, /^🟢/);
  for (const t of TEMPLATES.suspicious) assert.match(t, /^🚨/);
});

test("las variantes de cada tipo son todas distintas entre sí", () => {
  for (const kind of KINDS) {
    const set = new Set(TEMPLATES[kind]);
    assert.equal(set.size, TEMPLATES[kind].length, `${kind} tiene variantes duplicadas`);
  }
});

test("pickTemplate sin historia empieza por la variante 0", () => {
  const picked = pickTemplate("ack", null);
  assert.equal(picked.index, 0);
  assert.equal(picked.text, TEMPLATES.ack[0]);
  assert.equal(pickTemplate("verified", undefined).index, 0);
});

test("pickTemplate nunca repite el índice consecutivo (E07-T5)", () => {
  for (const kind of KINDS) {
    let last: number | null = null;
    // Recorre más de una vuelta completa para asegurar que en ningún paso repite.
    for (let i = 0; i < TEMPLATES[kind].length * 3; i++) {
      const picked = pickTemplate(kind, last);
      assert.notEqual(picked.index, last, `${kind}: repitió el índice ${String(last)}`);
      assert.equal(picked.text, TEMPLATES[kind][picked.index]);
      last = picked.index;
    }
  }
});

test("pickTemplate rota cíclicamente y cubre todas las variantes", () => {
  const kind: TemplateKind = "suspicious";
  const seen = new Set<number>();
  let last: number | null = null;
  for (let i = 0; i < TEMPLATES[kind].length; i++) {
    const picked = pickTemplate(kind, last);
    seen.add(picked.index);
    last = picked.index;
  }
  assert.equal(seen.size, TEMPLATES[kind].length, "no cubrió todas las variantes en una vuelta");
});

test("pickTemplate con lastIndex fuera de rango se trata como sin historia", () => {
  assert.equal(pickTemplate("ack", -1).index, 0);
  assert.equal(pickTemplate("ack", 999).index, 0);
  assert.equal(pickTemplate("ack", 1.5).index, 0);
});

test("templateKindForVerdict mapea VERIFIED/SUSPICIOUS", () => {
  assert.equal(templateKindForVerdict("VERIFIED"), "verified");
  assert.equal(templateKindForVerdict("SUSPICIOUS"), "suspicious");
});
