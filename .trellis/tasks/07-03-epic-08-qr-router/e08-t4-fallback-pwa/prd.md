# E08-T4 — Fallback a PWA cuando todo el pool está caído

Cuando ningún número del pool del negocio está sano (o no hay asignaciones), el endpoint
devuelve `{ action: "pwa" }` y la web renderiza el `VoucherFlow` existente de la Épica 9
EXACTAMENTE como antes (no se reescribe, solo se condiciona).

## Criterios de aceptación
- [x] Sin números sanos → `action=pwa`; el cliente aterriza en la PWA de subida.
- [x] La PWA de la Épica 9 queda intacta como fallback.
- [x] Test de pool completamente caído y de negocio sin asignaciones.
