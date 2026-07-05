# E06-T9 Defensa 7 - patrones sospechosos

## Goal

Implementar la Defensa 7 del motor de verificación (Épica 6): patrones sospechosos, con dos sub-señales previstas por el PRD, de las cuales en el MVP solo una está activa (D5).

## Requirements

1. **Intentos fallidos repetidos del mismo cliente en la red (across-tenant)** — sub-señal fuerte del MVP:
   - Si `DefenseContext.recentFailedAttemptsByClient` supera un umbral configurable → `fail`.
   - Umbral configurable vía `BusinessDefenseConfig.failedAttemptsThreshold` (campo nuevo, aditivo, agregado en `packages/verifier/src/types.ts`); por defecto `DEFAULT_FAILED_ATTEMPTS_THRESHOLD = 3` si el negocio no lo configura.
   - Si está bajo el umbral, o el campo es `undefined` (se trata como 0 intentos) → `pass`, sin `enablesGreen` (esta defensa nunca habilita 🟢; esa regla es exclusiva de la Defensa 1).
2. **Horarios por banco** — **apagada/pospuesta en el MVP por decisión D5** ("los bancos operan 24/7; señal débil y volátil"). No se implementa lógica real de horarios. Se documenta explícitamente en el código (`suspicious-patterns.ts`) que esta sub-señal está intencionalmente deshabilitada, para que quede trazable y no se confunda con un olvido.
3. **Crítico**: la defensa nunca debe producir `fail` por razones de horario en el MVP.

## Acceptance Criteria

- [x] `suspiciousPatternsDefense` exportado desde `packages/verifier/src/defenses/suspicious-patterns.ts`, implementando el contrato `Defense`.
- [x] N intentos fallidos configurados en la red (por encima del umbral) → `fail`.
- [x] Por debajo del umbral → `pass`.
- [x] Sin dato (`recentFailedAttemptsByClient` undefined) → `pass` (no penaliza por falta de dato).
- [x] Umbral configurable por negocio (`failedAttemptsThreshold`) respetado en ambos sentidos (sube y baja el umbral efectivo).
- [x] Test explícito que confirma que ningún horario/hora del día produce `fail` (blindaje contra regresión futura, D5).
- [x] `pnpm --filter @check/verifier build/typecheck/lint/test` pasa.

## Notes

- No se editó `src/index.ts` ni `package.json` (tarea en paralelo con otras defensas del mismo package; integración final la hace E06-T10).
- Único archivo compartido tocado: `packages/verifier/src/types.ts`, con una adición aditiva (campo opcional nuevo en `BusinessDefenseConfig`), documentada en el propio código y en el reporte de la tarea.
