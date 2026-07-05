# E06-T4 Defensa 2 - base global aprobaciones

## Goal

Implementar la Defensa 2 del motor de verificación antifraude (Épica 6): interpretar
si el número de aprobación del comprobante ya fue visto en la red global de negocios
(reutilización de comprobante), vía el campo ya precalculado por el llamador,
`DefenseContext.approvalNumberSeenGlobally`, sin tocar BD/Prisma (esa función ya
existe, fue construida en la Épica 2, E02-T11, como consulta solo-existencia
cross-tenant restringida — decisión **D6**).

## Requirements

- Exportar `globalApprovalsDefense: Defense` desde
  `packages/verifier/src/defenses/global-approvals.ts`, con `kind: "global_approval"`,
  implementando el contrato `Defense` de `src/types.ts` (E06-T1).
- La defensa **no consulta BD ni ejecuta I/O**: solo lee
  `input.context.approvalNumberSeenGlobally` y traduce a una `DefenseSignal` usando
  los helpers de `src/signal.ts` (`passSignal`/`failSignal`/`notApplicableSignal`).
- Reglas de interpretación del booleano (o ausencia):
  - `true` (número ya visto en la red) → `fail`. Reutilizar un número de aprobación
    es la señal de fraude más dura de la épica (🚨); no se pondera contra otras
    señales, no hay excepciones.
  - `false` (no visto) → `pass`. Esta defensa **nunca** marca `enablesGreen: true`:
    no es la Defensa 1 (esa es exclusiva de E06-T3, cruce con correo real del banco
    receptor); pasar esta defensa no habilita 🟢 por sí solo.
  - `undefined` (el llamador no pudo verificar la base global) → `not_applicable`
    (decisión explícita, ver Notes). No debe tratarse como `fail` ni como `pass`.
- No modificar `packages/verifier/src/index.ts`, `package.json`, ni ningún archivo
  fuera de `src/defenses/global-approvals.ts` y `test/defenses/global-approvals.test.ts`
  (tarea paralelizable junto a las otras 6 defensas del Grupo B; la integración final
  al agregador y al `index.ts` la hace E06-T10).
- No tocar Prisma/BD: la función de BD de solo-existencia cross-tenant (D6) ya existe
  (Épica 2, E02-T11) y está fuera de este scope; el cableado de quién la invoca antes
  de correr las defensas también es de otra tarea (worker, E06-T12).

## Acceptance Criteria

- [x] `globalApprovalsDefense.kind === "global_approval"`.
- [x] `approvalNumberSeenGlobally === true` → `outcome: "fail"`, `enablesGreen: false`,
      con `detail` legible para auditoría.
- [x] `approvalNumberSeenGlobally === false` → `outcome: "pass"`, `enablesGreen: false`.
- [x] `approvalNumberSeenGlobally === undefined` (explícito o campo ausente del
      contexto) → `outcome: "not_applicable"` (no penaliza), con test que documenta
      y justifica esta elección.
- [x] `pnpm --filter @check/verifier build` pasa.
- [x] `pnpm --filter @check/verifier typecheck` pasa.
- [x] `pnpm --filter @check/verifier lint` pasa.
- [x] Tests nuevos en `test/defenses/global-approvals.test.ts` pasan
      (ejecutados directamente con `tsx --test`, ya que el script `test` del
      `package.json` — no modificado por esta tarea — no incluye aún el archivo
      nuevo; E06-T10 deberá añadirlo al glob/lista de tests al integrar).

## Notes

- **Decisión sobre `undefined`:** se eligió `not_applicable` en vez de `fail` o
  `pass`. Razón: `undefined` señala que el llamador no pudo ejecutar/confiar en la
  consulta de solo-existencia (ej. timeout, función de BD no disponible), lo cual es
  una falla de infraestructura ajena al comprobante evaluado — no evidencia de
  fraude. Se extiende aquí, por analogía razonada, el principio D4 ("cuenta destino
  ilegible no penaliza") a "verificación no disponible no penaliza". El costo de
  este criterio (una reutilización real podría colarse si su verificación falla
  silenciosamente) se acepta porque la regla dura de la épica ya exige que la
  Defensa 1 (cruce con correo real del banco receptor, E06-T3) pase en positivo
  para llegar a 🟢; un `not_applicable` aquí nunca produce `VERIFIED` por sí solo,
  y el llamador (E06-T12) es responsable de loggear/alertar cuando esta consulta
  falla, para no depender silenciosamente de este comportamiento permisivo.
- Se creó `packages/verifier/test/defenses/` (no existía) para alojar tests de
  defensas individuales, siguiendo el estilo de `test/aggregate.test.ts` y
  `test/mock-defense.ts` (voucher de ejemplo, `DefenseInput` mínimo, asserts sobre
  `DefenseSignal`).
- Referencias: `.trellis/tasks/07-03-epic-06-verification-engine/prd.md` (E06-T4),
  `.trellis/spec/decisions.md` (D4, D6), `packages/verifier/src/types.ts`
  (`DefenseContext.approvalNumberSeenGlobally`).
