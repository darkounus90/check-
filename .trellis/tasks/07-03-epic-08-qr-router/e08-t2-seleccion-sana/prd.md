# E08-T2 — Selección usando health checks del pool

La selección del número usa la salud persistida (`WaNumber.health`) y reproduce EXACTAMENTE
el contrato de `pickHealthyNumberForBusiness` (E07-T8): prefiere `connected`, cae a `degraded`,
nunca `banned`/`warming`. Lógica pura en `qr-router.ts` (`resolveQr`), testeable en memoria.

## Criterios de aceptación
- [x] Nunca resuelve a un número marcado caído (`banned`) o `warming`.
- [x] Prefiere `connected`; usa `degraded` solo como último recurso.
- [x] Orden de candidatos: prioridad desc, empate → asignación más antigua.
