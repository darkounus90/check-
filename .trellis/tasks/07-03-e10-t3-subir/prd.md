# E10-T3 — Subir comprobante desde el dashboard autenticado

Épica 10, Grupo B (cajero). Reemplaza el placeholder "próximamente" de `dashboard/subir`.

## Goal

Que el cajero (y el dueño) suba un comprobante desde el dashboard autenticado y quede
ligado a su negocio, reutilizando el pipeline de subida existente.

## Requirements

- [x] Vista `dashboard/subir` con captura de foto (cámara trasera) o selección de archivo
      (imagen/PDF), validación en cliente (tipo + tamaño ≤ 10 MB) y barra de progreso.
- [x] Al subir con éxito, se refresca el estado en vivo sin recargar (integra E10-T4).
- [x] Datos iniciales cargados server-side vía `apiFetch` (aislado por negocio, RLS).
- [x] Nunca se loguean tokens ni claims.

## GAP documentado (apps/api, fuera de alcance)

No existe un endpoint autenticado de subida de vouchers ni `GET /me` expone el `opaqueId`
del negocio. Para no tocar el backend, la subida reutiliza la ruta pública existente
`POST /public/n/:opaqueId/vouchers` con el `opaqueId` inyectado por env
(`NEXT_PUBLIC_BUSINESS_OPAQUE_ID`, ver `lib/data/voucher-link.ts`). Si no está configurado,
la vista muestra un aviso claro (subida autenticada aún no habilitada) sin romper el resto.

**Recomendación al backend:** exponer `POST /vouchers` autenticado que resuelva el
`businessId` del JWT/`/me`, o añadir `opaqueId` a la respuesta de `GET /me`.

## Acceptance criteria

- [x] El cajero sube un archivo y ve confirmación + el comprobante aparece en el estado en
      vivo (cuando hay opaqueId configurado).
- [x] Sin opaqueId, la vista degrada con un aviso, no con un error.
- [x] `pnpm --filter @check/web build|typecheck|lint` en verde.

## Files

- `apps/web/app/(dashboard)/dashboard/subir/page.tsx`
- `apps/web/app/(dashboard)/dashboard/subir/upload-voucher.tsx`
- `apps/web/app/(dashboard)/dashboard/subir/cashier-uploader.tsx`
- `apps/web/lib/data/voucher-link.ts`
