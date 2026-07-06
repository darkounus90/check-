# E07-T2 Recepcion de comprobante WhatsApp al pipeline OCR

## Goal

Cuando llega una imagen/PDF a la instancia de WhatsApp, meterla al MISMO pipeline OCR ->
verificación de las Épicas 5/6: descargar el media, subirlo a Storage con la convención del
pipeline, crear el `Voucher` ligado al negocio y encolarlo en la MISMA cola OCR. Persistir
el mapeo conversación↔voucher para poder responder el veredicto después (E07-T3).

## Requirements

- Escuchar `messages.upsert` (solo `type: "notify"`), filtrar `fromMe` / status broadcast.
- `detectVoucherMedia`: aceptar `imageMessage` (JPEG/PNG/WEBP) y `documentMessage` PDF; MISMO
  mapa MIME→ext que `ALLOWED_VOUCHER_MIME_TYPES` de la ingesta pública (`apps/api/src/public`).
- Descargar el media con `downloadMediaMessage` (buffer).
- Subir a Storage: bucket `vouchers`, ruta `{businessId}/{uuid}.{ext}` (misma convención que
  `apps/api` y `apps/workers/storage`). Reusar el `StorageService` (se le añade `uploadVoucher`).
- Crear `Voucher` (businessId + storagePath) y encolar en la cola `ocr-processing`, job `ocr`,
  payload `{voucherId}` (reusar `OcrQueueService.enqueueVoucherOcr`, NO duplicar constantes).
- Persistir el mapeo conversación↔voucher: JID remitente + voucherId + waNumberId.
- Resolver el negocio destino desde el número receptor vía `NumberPoolAssignment`.

## Acceptance Criteria

- [x] Una imagen/PDF enviada al número queda como `Voucher` con su imagen en Storage y
      encolada en `ocr-processing` (misma cola/job/payload del pipeline).
- [x] Se persiste el `WaVoucherContext` (JID + voucherId + waNumberId) del comprobante.
- [x] Mensajes que no son comprobante (texto, sticker, doc no-PDF) se ignoran.
- [x] `pnpm --filter @check/whatsapp` y `@check/workers` (build|typecheck|lint|test) verde.

## Notes

- Resolución de negocio N↔M (LIMITACIÓN): un número puede estar asignado a varios negocios.
  Sin desambiguación por mensaje (eso es E07-T8), se toma la asignación de MAYOR `priority`
  (empate → la más antigua). Documentado en `WhatsAppStore.resolveBusinessId`.
- Cambio de schema (excepción documentada): se añade el modelo `WaVoucherContext`
  (`voucherId` único, `remoteJid`, `waNumberId`, `notifiedAt`) + migración Prisma, porque el
  schema de la Épica 2 no tenía dónde guardar el vínculo conversación↔voucher.
