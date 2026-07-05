# E06-T6 Defensa 4 - ventana de tiempo

## Goal

Implementar la Defensa 4 del motor de verificación antifraude (Épica 6, Grupo B):
una ventana de tiempo estricta configurable por negocio que valida que el comprobante
se haya pagado dentro de un plazo razonable respecto al momento de la verificación.

## Requirements

- Distinta de la ventana de la Defensa 1 (E06-T3, cruce con el correo bancario real,
  ±15 min configurable). Esta es una ventana de **negocio** más amplia: el comprobante
  (`ExtractedVoucher.paidAtUtc`) debe haberse pagado dentro de una ventana configurable
  respecto a "ahora" (`DefenseContext.nowUtc`) — ej. no aceptar comprobantes de hace más
  de N horas/días.
- Reutiliza el campo de configuración existente `BusinessDefenseConfig.verificationWindowMinutes`
  (ya documentado en `types.ts` como compartido entre Defensa 1 y Defensa 4); configurable
  por negocio, por lo que la misma diferencia de tiempo puede dar resultados distintos
  según el negocio.
- Si el comprobante está fuera de la ventana → `fail` (el agregador ya garantiza que
  `fail` nunca permite `VERIFIED`/🟢, y produce `SUSPICIOUS`/🚨).
- Si está dentro de la ventana → `pass`, sin `enablesGreen` (solo la Defensa 1 habilita 🟢).
- Sin `context.nowUtc` o sin `verificationWindowMinutes` configurado, o si alguna de las
  fechas no es parseable → `not_applicable` (D4: falta de dato/configuración no penaliza).
- Determinista: usa únicamente `context.nowUtc` para "ahora"; nunca `Date.now()` real
  dentro de la lógica de evaluación (mismo principio de pureza que `state-machine.ts`).
- No editar `src/index.ts`, `package.json` ni archivos de otras tareas paralelas del
  Grupo B (E06-T3, T4, T5, T7, T8, T9) — la integración final la hace E06-T10.

## Acceptance Criteria

- [x] `packages/verifier/src/defenses/time-window.ts` exporta
      `export const timeWindowDefense: Defense`.
- [x] Comprobante dentro de la ventana configurada → `pass`.
- [x] Comprobante fuera de la ventana configurada → `fail` (fuera de ventana no permite 🟢).
- [x] La misma diferencia de tiempo produce resultados distintos según la ventana
      configurada por negocio (ventana estricta vs. laxa).
- [x] `pnpm --filter @check/verifier build/typecheck/lint` pasan.
- [x] Tests en `packages/verifier/test/defenses/time-window.test.ts` pasan
      (ejecutados manualmente con `tsx --test`, ya que el script `test` del
      `package.json` del paquete lista archivos explícitos y no se editó para
      evitar conflictos con tareas paralelas; E06-T10 debe agregar este archivo
      a dicho script al integrar).

## Notes

- Riesgo de conflicto conocido: no se tocó `types.ts` (no fue necesario, el campo
  `verificationWindowMinutes` y `context.nowUtc` ya existían).
- Riesgo de integración conocido: `packages/verifier/package.json` tiene
  `"test": "tsx --test test/aggregate.test.ts test/state-machine.test.ts"` con lista
  explícita de archivos. El nuevo test en `test/defenses/time-window.test.ts` no corre
  automáticamente con `pnpm --filter @check/verifier test` hasta que E06-T10 (o quien
  edite `package.json`) lo agregue al glob/lista. Se verificó manualmente con
  `npx tsx --test test/defenses/time-window.test.ts` (8/8 pass).
