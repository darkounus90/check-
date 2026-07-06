# E08-T1 — Endpoint de resolución + redirect a wa.me

Endpoint público `GET /public/n/:opaqueId/route` que resuelve el escaneo al número WhatsApp
sano del negocio y devuelve un DTO discriminado; la web lo consume server-side y hace
`redirect(waMeUrl)`. Público sin JWT; el negocio se resuelve por `opaqueId` (cuid no
enumerable) y la respuesta nunca filtra el `businessId` ni el `waNumberId`.

## Contrato
- `{ "action": "whatsapp", "waMeUrl": "https://wa.me/57...", "reason": "primary|failover" }`
- `{ "action": "pwa" }` cuando no hay número sano.

## Criterios de aceptación
- [x] Escanear `/n/{opaqueId}` abre WhatsApp con el número asignado sano (redirect server-side).
- [x] El `opaqueId` no es enumerable y no se filtra el businessId.
- [x] El router de la web (`apps/web/app/n/[opaqueId]/page.tsx`) redirige o cae a la PWA.
