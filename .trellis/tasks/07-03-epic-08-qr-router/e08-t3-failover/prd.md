# E08-T3 — Failover automático a número secundario

Con el primario caído, la siguiente resolución usa el secundario sano de forma transparente
(`reason=failover`). El orden respeta prioridad y excluye no-sanos.

## Criterios de aceptación
- [x] Primario caído → la resolución devuelve el secundario sano sin intervención.
- [x] `reason` distingue `primary` (candidato de mayor preferencia) de `failover`.
- [x] Test que simula el primario `banned` y verifica el salto al siguiente sano.
