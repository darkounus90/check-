# E08-T6 — Generación del QR/URL estable por negocio

Endpoint autenticado (dueño) `GET /me/qr` que genera el QR (PNG + SVG) apuntando a la URL
estable `${PUBLIC_APP_URL}/n/{opaqueId}` (dominio configurable por env). Descarga desde el
dashboard del dueño (`/dashboard/qr`). Dep `qrcode` + `@types/qrcode`.

## Criterios de aceptación
- [x] Cada negocio obtiene su QR estable descargable (PNG y SVG) que apunta a su ruta.
- [x] La URL usa `PUBLIC_APP_URL` configurable (añadido a env + .env.example).
- [x] Endpoint solo OWNER; el negocio sale del JWT, nunca de un parámetro del cliente.
