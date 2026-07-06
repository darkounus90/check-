# E09-T3 Componente de captura y subida

## Goal

Permitir que un cliente final, desde el móvil y sin login, suba el
comprobante de pago (foto o PDF) en la ruta pública `/n/{opaqueId}`:
captura con cámara o selección de archivo, validación de tipo/tamaño en
cliente, preview del archivo elegido y subida con progreso al endpoint
público del API (E09-T4). El resultado en vivo tras la subida es E09-T5;
los estados de error finos y reintentos son E09-T6.

## Requirements

- Client component `apps/web/app/n/[opaqueId]/voucher-flow.tsx` montado por
  la página pública de E09-T1/T2. Mobile-first: botones grandes y textos
  claros para un cliente no técnico (español).
- Dos vías de entrada: input de cámara (`capture="environment"`, solo
  imágenes) e input de archivo (imágenes + PDF), ambos ocultos y disparados
  por botones.
- Tipos aceptados: `image/jpeg`, `image/png`, `image/webp`,
  `application/pdf`. Tamaño máximo: 10 MB. La validación ocurre EN CLIENTE
  antes de enviar, con mensaje de error claro si falla.
- Preview del archivo elegido: imagen renderizada (object URL, revocado al
  cambiar/desmontar); PDF como tarjeta con nombre y tamaño. Botón "Cambiar
  archivo".
- Subida como `multipart/form-data` (campo `file`) a
  `POST /public/n/:opaqueId/vouchers` con barra/porcentaje de progreso
  (XMLHttpRequest). Estados básicos: subiendo / error genérico con botón
  "Reintentar" / subido (pasa a E09-T5).
- Todas las llamadas al API público centralizadas en un único módulo
  tipado (`apps/web/lib/public-api.ts`) para que un ajuste del contrato sea
  un cambio de un solo archivo. Base URL vía `NEXT_PUBLIC_API_URL`
  (default de desarrollo `http://localhost:3001`, agregada a `.env.example`).
- El `opaqueId` y el `voucherId` no se loguean en consola/analytics (D3).
- El fetch del negocio (`GET /public/n/:opaqueId`) se hace server-side en la
  página; si responde 404 se muestra "Este enlace no es válido" sin filtrar
  detalles, y solo se pasa `name` + `opaqueId` al client component.
- `pnpm --filter @check/web build`, `typecheck` y `lint` deben pasar.

## Acceptance Criteria

- [x] Desde `/n/{opaqueId}` se puede tomar foto (cámara trasera vía
      `capture="environment"`) o elegir un archivo (imagen o PDF).
- [x] Un archivo de tipo no permitido o mayor a 10 MB se rechaza en cliente
      con mensaje claro, sin llegar a la red.
- [x] El archivo elegido se previsualiza (imagen) o se muestra como tarjeta
      con nombre y tamaño (PDF) antes de enviar.
- [x] La subida muestra progreso (porcentaje) y estados básicos: subiendo,
      error con "Reintentar", y éxito (pasa al resultado en vivo de E09-T5).
- [x] Las llamadas al API público viven solo en `apps/web/lib/public-api.ts`
      (contrato en un único archivo) y los códigos 404/413/415 del endpoint
      de subida se mapean a mensajes entendibles.
- [x] El `opaqueId`/`voucherId` no aparecen en `console.*` ni analytics.
- [x] `pnpm --filter @check/web build`, `typecheck` y `lint` pasan.

## Notes

- El contrato del API es el fijado para la épica (E09-T4 lo implementa en
  paralelo): `GET /public/n/:opaqueId` → `{ name }`,
  `POST /public/n/:opaqueId/vouchers` (multipart, campo `file`) →
  `{ voucherId }`, `GET /public/vouchers/:voucherId` →
  `{ ocrStatus, verdict }`. No se probó end-to-end contra el API real en
  esta tarea.
- Se usó `XMLHttpRequest` para la subida porque `fetch` aún no expone
  progreso de upload de forma amplia; el resto de llamadas usan `fetch`.
- Estados de error detallados (foto ilegible, timeouts diferenciados,
  reintentos finos) quedan para E09-T6; aquí solo hay error genérico +
  "Reintentar".
- `NEXT_PUBLIC_API_URL` quedó descomentada en `.env.example` con el default
  de desarrollo `http://localhost:3001` (puerto real de `apps/api`, ver
  `apps/api/src/env.ts`).
- Deuda pre-existente: `@check/web` sigue sin test runner (`"test": "echo
  ..."`), por eso no hay tests de componente.
