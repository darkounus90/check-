# E06-T2 Máquina de estados del semáforo

## Goal

Modelar como máquina de estados **pura** (sin I/O, sin BD, sin colas) la evolución de
un veredicto ya emitido en `PENDING` (🟡) por el agregador (`runDefenses`/`aggregateSignals`,
E06-T1) mientras se espera el correo real del banco receptor (Defensa 1, E06-T3): al
reintentar la evaluación dentro de la ventana configurable, el veredicto se resuelve a
`VERIFIED`/`SUSPICIOUS` si el agregador ya lo decide, sigue en `PENDING` si la ventana no
expiró, o transiciona a `SUSPICIOUS` si la ventana expiró sin confirmación.

Esta pieza es consumida por el worker de verificación (E06-T12), que sí hace el I/O real
(cola, reintentos programados, volver a correr `runDefenses` con el contexto actualizado).

## Requirements

- Nueva función (o funciones) puras en `packages/verifier/src/state-machine.ts`,
  exportadas desde `src/index.ts`, siguiendo el mismo estilo que `aggregate.ts`/`signal.ts`.
- Sin `Date.now()` ni reloj real dentro de la lógica: el "ahora" y el "momento en que se
  emitió el `PENDING`" se reciben como parámetros (timestamps ISO UTC), para que los tests
  sean deterministas.
- Reutiliza `verificationWindowMinutes` de `BusinessDefenseConfig` (E06-T1) como la ventana
  de espera configurable por negocio; no se requiere extender `DefenseContext`.
- Reglas de transición sobre un veredicto `PENDING`:
  - Si al reintentar el agregador el nuevo veredicto es `VERIFIED` o `SUSPICIOUS`, ese es el
    estado final (el agregador manda).
  - Si el reintento sigue dando `PENDING` y la ventana **no** expiró, el estado permanece
    `PENDING` (para reintentar más tarde).
  - Si el reintento sigue dando `PENDING` y la ventana **expiró**, el estado transiciona a
    `SUSPICIOUS` (regla dura: expiración sin correo real = sospechoso).
- Se provee una función de conveniencia que orquesta un "reintento de evaluación" inyectado
  (callback síncrono o asíncrono que vuelve a correr el agregador con contexto actualizado),
  para que el worker (E06-T12) no tenga que reimplementar la lógica de expiración.
- Tests con `node:test` en `packages/verifier/test/state-machine.test.ts`, mismo estilo
  que `test/aggregate.test.ts`, con tiempos inyectados (sin usar el reloj real).

## Acceptance Criteria

- [x] Un veredicto `PENDING` se resuelve a `VERIFIED` si el reintento del agregador da
      `VERIFIED` dentro o fuera de ventana (el agregador manda).
- [x] Un veredicto `PENDING` se resuelve a `SUSPICIOUS` si el reintento del agregador da
      `SUSPICIOUS`.
- [x] Un veredicto `PENDING` permanece `PENDING` si el reintento sigue `PENDING` y la
      ventana configurada aún no expiró (para el correo del banco).
- [x] Un veredicto `PENDING` transiciona a `SUSPICIOUS` si la ventana expiró y el reintento
      sigue `PENDING` (correo nunca llegó a tiempo).
- [x] La lógica es pura y testeable con tiempos inyectados (sin `Date.now()` real).
- [x] `pnpm --filter @check/verifier build/typecheck/lint/test` y
      `pnpm build && pnpm typecheck && pnpm test` (raíz) pasan.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
