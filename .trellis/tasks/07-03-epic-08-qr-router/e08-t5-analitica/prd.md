# E08-T5 — Registro/analítica de cada resolución

Cada resolución persiste una fila en la tabla nueva `QrResolutionLog` (migración Prisma
mínima): `businessId`, `waNumberId` (null en fallback) y `reason` (`PRIMARY`/`FAILOVER`/
`FALLBACK_PWA`). D3: NO se persiste el `opaqueId`. El registro no bloquea la resolución.

## Criterios de aceptación
- [x] Cada escaneo deja una traza consultable por operación (número elegido, motivo, fallback).
- [x] Tabla `QrResolutionLog` + migración + cliente Prisma regenerado, schema válido.
- [x] Un fallo al registrar la traza no tumba el enrutado del cliente.
