# E06-T1 Contrato Defense y agregador

## Goal

Definir el contrato `Defense` (comprobante extraído + contexto de negocio → señal
ponderada) y el agregador que combina las señales de todas las defensas en un
`Verdict` (🟢/🟡/🚨) determinista, dejando ya cableada la regla dura de la Épica 6:
**sin una defensa marcada como habilitadora de verde (Defensa 1 — cruce con correo
real del banco receptor, E06-T3) que pase, el veredicto nunca puede ser `VERIFIED`
(🟢)**. Esta tarea es la base de contrato que usarán las 7 defensas (E06-T3..T9) y
la integración final (E06-T10).

## Requirements

- Nuevo package `packages/verifier` (`@check/verifier`), ESM puro (D8),
  siguiendo la convención de `packages/ocr`/`packages/parsers` (estructura de
  carpetas, `package.json`, tests con `node:test` vía `tsx`, barrel `src/index.ts`).
- Tipo `DefenseInput`: comprobante ya extraído (`ExtractedVoucher` de `@check/ocr`)
  + contexto mínimo de negocio (`DefenseContext`): configuración del negocio
  (cuenta/beneficiario declarado, ventana de verificación), correos bancarios
  recibidos y parseados (`ParsedBankEmail` de `@check/parsers`), existencia global
  del número de aprobación (D6) e intentos fallidos recientes del cliente (D5).
  El contexto se modela mínimo hoy; se amplía sin romper la forma en E06-T3..T9.
- Tipo `DefenseSignal`: expresa `outcome` (`"pass" | "fail" | "not_applicable"`),
  `weight` (confianza `[0,1]`, reservado para combinar señales débiles — D4),
  `enablesGreen` (solo verdadero en la Defensa 1) y `detail` opcional para
  auditoría. `not_applicable` existe explícitamente para que una defensa que no
  puede evaluarse (ej. cuenta destino ilegible, D4) **no penalice** por sí sola.
- Contrato `Defense`: `{ kind, evaluate(input): DefenseSignal | Promise<DefenseSignal> }`.
- Agregador `runDefenses(defenses, input): Promise<Verdict>` (+ `aggregateSignals`
  para agregar señales ya calculadas sin necesidad de instanciar `Defense`s):
  - Cualquier señal `fail` → `SUSPICIOUS` (🚨), sin importar el resto.
  - Sin ningún `fail`, si la señal marcada `enablesGreen` pasó → `VERIFIED` (🟢).
  - En cualquier otro caso (sin defensa `enablesGreen` configurada, o configurada
    pero aún no confirma) → `PENDING` (🟡). Esto aplica la regla dura incluso hoy,
    sin tener aún la Defensa 1 real implementada.
  - Determinista: mismas señales de entrada → mismo `Verdict` de salida.
- `Verdict.evidenceSources` debe ser compatible con el modelo Prisma
  `EvidenceSource` (`kind: string`, `passed: boolean`, `detail?: string`) para que
  E06-T11 lo persista en `MoneyOpLog`/`Transaction`/`EvidenceSource` sin mapeo.
- `Verdict.status` (`"VERIFIED" | "PENDING" | "SUSPICIOUS"`) coincide en valores
  con el enum Prisma `VerdictStatus`.
- Defensas mock para tests (`test/mock-defense.ts`, no exportadas del paquete
  público) que simulan escenarios: todas pasan con Defensa 1 real → 🟢; alguna
  falla → 🚨; sin Defensa 1 → nunca 🟢; Defensa 1 aún no confirma → 🟡; señal
  `not_applicable` no penaliza; soporte de defensas asíncronas; determinismo.

## Acceptance Criteria

- [x] El motor corre con defensas mock y produce un veredicto determinista
      (7 tests en `packages/verifier/test/aggregate.test.ts`, todos verdes).
- [x] El contrato permite marcar la Defensa 1 (`enablesGreen`) aunque hoy no
      exista una implementación real, y el agregador nunca emite `VERIFIED` sin
      que esa defensa pase (regla dura, ver tests dedicados).
- [x] Una señal `not_applicable` (ej. dato ilegible, D4) no baja el veredicto a
      `SUSPICIOUS` por sí sola.
- [x] `Verdict`/`EvidenceSource` son compatibles con los modelos Prisma
      (`VerdictStatus`, `EvidenceSource.kind`/`passed`/`detail`) sin necesitar
      transformación adicional en E06-T11.
- [x] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` en la raíz del
      monorepo pasan en verde con el nuevo package incluido.

## Notes

- Ubicación del código: `packages/verifier` (`@check/verifier`).
- Diseño del contrato documentado en `packages/verifier/src/types.ts` y
  `packages/verifier/src/aggregate.ts` para que E06-T2 (máquina de estados)
  y E06-T3..T9 (las 7 defensas) lo consuman sin ambigüedad.
