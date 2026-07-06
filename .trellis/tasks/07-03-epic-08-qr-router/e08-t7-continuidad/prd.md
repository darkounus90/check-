# E08-T7 — Test de continuidad primario→secundario→PWA

Test de cadena que simula caídas escalonadas: primario sano → cae → secundario → cae → PWA.
La resolución siempre llega a un canal funcional (cero downtime percibido).

## Criterios de aceptación
- [x] Con todo sano resuelve al primario (`primary`).
- [x] Al caer el primario resuelve al secundario (`failover`).
- [x] Al caer también el secundario cae a la PWA (`FALLBACK_PWA`).
