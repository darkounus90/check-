# E06-T13 Suite de escenarios de fraude

## Goal

Cerrar la Épica 6 (motor de verificación antifraude) con una suite de pruebas explícitamente
centrada en **escenarios de fraude nombrados**, corriendo las 7 defensas reales de
`@check/verifier` (sin mocks) a través del agregador real (`runDefenses`/`allDefenses`), para
demostrar que el criterio de aceptación de la épica se cumple: dado un comprobante + estado de
correos, el motor emite el veredicto correcto según las reglas de negocio.

Esta suite es complementaria a, y no reemplaza, la integración básica ya existente en
`packages/verifier/test/wire-defenses.test.ts` (E06-T10) ni los tests end-to-end del worker en
`apps/workers/test/verification.processor.test.ts` (E06-T12).

## Requirements

- Ubicar la suite en `packages/verifier/test/fraud-scenarios.test.ts` (mismo package que las
  defensas; no requiere BD real).
- Usar `allDefenses`/`runDefenses` de `@check/verifier` directamente, construyendo el
  `DefenseInput`/`DefenseContext` a mano para cada escenario (comprobantes extraídos + correos
  bancarios recibidos + flags de contexto), sin pasar por el worker/Prisma.
- Cubrir como mínimo los siguientes escenarios nombrados:
  1. **Comprobante falso** — sin correo bancario real que lo respalde. Cubrir ambos sub-casos:
     aún no llegó ningún correo (→ `PENDING`) y llegaron correos pero ninguno coincide
     (→ `SUSPICIOUS`). Nunca `VERIFIED` en ninguno de los dos.
  2. **Número de aprobación reutilizado** (`approvalNumberSeenGlobally: true`) → `SUSPICIOUS`,
     incluso con un correo que matchea perfecto.
  3. **Monto alterado** (el comprobante declara un monto distinto al que aparece en el correo
     real del banco) → la Defensa 1 no matchea → `PENDING` o `SUSPICIOUS` según haya o no
     correos recibidos, nunca `VERIFIED`.
  4. **Cuenta destino alterada** (no coincide con lo declarado por el negocio, aunque el correo
     del banco sí matchee monto/aprobación/cuenta reales del comprobante) → la Defensa 3
     (account-match) falla y baja el veredicto a `SUSPICIOUS`, aunque la Defensa 1 sí pase.
  5. **Fuera de ventana de tiempo** (comprobante pagado mucho después de la ventana configurada
     del negocio) → la Defensa 4 (time-window) falla → `SUSPICIOUS`, nunca `VERIFIED`.
  6. **Caso feliz de control** (correo real matchea, cuenta coincide, dentro de ventana, sin
     reutilización, imagen limpia, número con formato válido) → `VERIFIED`. Control negativo que
     confirma que el motor no es excesivamente restrictivo.
- Para cada escenario, verificar tanto el `status` del `Verdict` como la entrada relevante en
  `verdict.evidenceSources` (kind + `passed`) de la defensa que decide ese escenario.
- El script `test` del package (`tsx --test "test/**/*.test.ts"`) debe recoger el archivo nuevo
  automáticamente sin cambios adicionales.

## Acceptance Criteria

- [x] Cada escenario produce el veredicto esperado (verificado con `runDefenses(allDefenses, ...)`
      sobre las 7 defensas reales, sin mocks).
- [x] `pnpm --filter @check/verifier build/typecheck/lint/test` pasa.
- [x] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` desde la raíz del repo pasa.
- [x] No se duplican los tests ya cubiertos por `wire-defenses.test.ts` (E06-T10) ni por
      `verification.processor.test.ts` (E06-T12); esta suite se centra en escenarios de fraude
      nombrados con verificación explícita de `evidenceSources`.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
