# E06-T8 Defensa 6 - validacion estructural

## Goal

Implementar la Defensa 6 del motor de verificación antifraude (Épica 6, Grupo B):
validar que el `approvalNumber` extraído de un comprobante (Épica 5, OCR) tenga un
formato/longitud plausible para el `issuerBank` declarado, como señal adicional de
sospecha (no habilita 🟢 — esa es exclusiva de la Defensa 1, E06-T3).

## Requirements

- Exportar `structuralDefense: Defense` en `packages/verifier/src/defenses/structural.ts`,
  siguiendo el mismo contrato/estilo que las demás defensas del Grupo B
  (`account-match.ts`, `global-approvals.ts`).
- Mantener una tabla/mapa interno de reglas por `issuerBank` (string literal usado por
  `ExtractedVoucher.issuerBank`, ver `packages/ocr/src/types.ts` — no es un enum de
  `@check/database`, es el string que produce cada `VoucherExtractor` de
  `packages/ocr/src/extractors.ts`).
- Regla por banco: `approvalNumber` debe ser **solo dígitos** (`^\d+$`) y tener una
  **longitud dentro de un rango `[min, max]`** propio de ese banco.
- **Estas reglas son heurísticas basadas en los 7 fixtures sintéticos existentes en
  `packages/ocr/test/fixtures/*.txt` (un solo ejemplo por banco, marcados
  "FIXTURE SINTETICO"), NO especificaciones oficiales certificadas por cada banco.**
  Se documenta explícitamente en el código para que se refinen cuando existan
  comprobantes reales. Todos los extractores actuales capturan el número de aprobación
  con `(\d+)` (solo dígitos), así que la regla "solo dígitos" es consistente con lo que
  el pipeline OCR ya produce hoy; los rangos de longitud se tomaron de la longitud
  observada en el fixture de cada banco con un margen amplio (no ajustado exacto), dado
  que no hay especificación oficial disponible:
  - `nequi`: 6–10 dígitos (fixture: `1234567`, 7 dígitos)
  - `bancolombia`: 5–10 dígitos (fixture: `998877`, 6 dígitos)
  - `daviplata`: 6–12 dígitos (fixture: `55667788`, 8 dígitos)
  - `davivienda`: 5–10 dígitos (fixture: `123456`, 6 dígitos)
  - `bbva`: 5–10 dígitos (fixture: `456789`, 6 dígitos)
  - `banco_de_bogota`: 6–10 dígitos (fixture: `7654321`, 7 dígitos)
  - `colpatria`: 5–10 dígitos (fixture: `246810`, 6 dígitos)
- Si `voucher.approvalNumber` o `voucher.issuerBank` están vacíos/ausentes →
  `not_applicable` (dato faltante; no penaliza — sería redundante con otras
  validaciones de completitud del pipeline OCR, D4 por analogía).
- Si `voucher.issuerBank` no está en la tabla (banco no reconocido/sin regla definida)
  → `not_applicable` (no hay base para afirmar que el formato es inválido; no se
  inventa una regla para un banco desconocido).
- Si el formato es inválido para el banco declarado (no todo dígitos, o longitud fuera
  del rango) → `fail`.
- Si el formato es válido → `pass`, sin `enablesGreen`.
- No editar `src/index.ts`, `package.json` ni ningún archivo fuera de los propios de
  esta tarea (trabajo en paralelo con otras defensas del Grupo B sobre el mismo
  package).

## Acceptance Criteria

- [x] `structuralDefense: Defense` exportado desde `packages/verifier/src/defenses/structural.ts`.
- [x] Número con formato válido para su banco → `pass`, `enablesGreen: false`.
- [x] Número con formato claramente inválido (letras donde solo van dígitos, o
      longitud fuera de rango) → `fail`.
- [x] `approvalNumber` o `issuerBank` ausente → `not_applicable`.
- [x] Tests en `packages/verifier/test/defenses/structural.test.ts` cubriendo al menos
      3 de los 7 bancos.
- [x] `pnpm --filter @check/verifier build`, `typecheck`, `lint` pasan.
- [x] Tests del archivo propio (`tsx --test test/defenses/structural.test.ts`) pasan
      (el `test` script del package aún no incluye `test/defenses/*` — se integrará en
      E06-T10).

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
