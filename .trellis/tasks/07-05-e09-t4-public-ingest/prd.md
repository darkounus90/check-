# E09-T4 Endpoint publico de ingesta

## Goal

Que un cliente sin login pueda subir su comprobante (imagen o PDF) desde la PWA
(`/n/{opaqueId}`) y que ese comprobante entre EXACTAMENTE al mismo pipeline
OCR → verificación antifraude de las Épicas 5/6 (igual que llegará por
WhatsApp), más un endpoint de polling para que la PWA muestre el semáforo
🟡→🟢/🚨 (E09-T5).

## Requirements

- `POST /public/n/:opaqueId/vouchers` (multipart, campo `file`), público (sin
  JWT), en el módulo `apps/api/src/public/`:
  - Acepta `image/jpeg`, `image/png`, `image/webp`, `application/pdf`;
    máximo 10 MB.
  - `201 {voucherId}` | `404` opaqueId inexistente | `413` archivo muy grande
    | `415` tipo no soportado | `400` sin campo `file`.
  - Resuelve el negocio server-side por `opaqueId` (E09-T2); nunca confía en
    un `businessId` del cliente.
- Reutilizar el pipeline existente SIN duplicar lógica:
  - Archivo → bucket privado de Supabase Storage `vouchers` (misma convención
    que `apps/workers/src/storage/storage.service.ts`), ruta
    `{businessId}/{uuid}.{ext}`; la ruta no se expone al cliente.
  - Crear `Voucher` (`businessId`, `storagePath`, `ocrStatus=PENDING`).
  - Encolar en BullMQ: cola `ocr-processing`, job `ocr`, payload
    `{voucherId}` y mismas opciones de reintento que el productor de
    `apps/workers` (E05-T3). La verificación (E06-T12) la encola el worker de
    OCR al terminar, como en cualquier otro canal.
- `GET /public/vouchers/:voucherId` (polling, público):
  `200 {ocrStatus, verdict}` con los enums reales de Prisma
  (`OcrStatus`: PENDING/PROCESSED/LOW_QUALITY/FAILED; `verdict`:
  VERIFIED/PENDING/SUSPICIOUS o `null` sin `Transaction`) | `404`. El cuid del
  voucher es el handle público; no se filtra nada del negocio ni de otros
  vouchers.
- Documentar el contrato final en `research/public-api-contract.md` (el agente
  web de E09-T3/T5 codea contra él).
- Rate limiting fino por negocio/IP NO es de esta tarea (E09-T7), pero el
  código debe quedar listo para añadirlo (controlador público aislado).

## Acceptance Criteria

- [x] Ingesta feliz: sube a Storage bajo el prefijo del negocio, crea el
      `Voucher` ligado al negocio correcto y encola el job de OCR con el
      contrato exacto de E05-T3 (tests unitarios con fakes de Prisma, Storage
      y cola).
- [x] `404` con opaqueId inexistente sin subir/crear/encolar nada.
- [x] `415` con tipo no soportado y `413` con > 10 MB (límite de multer en el
      interceptor + defensa en el servicio); nada persiste.
- [x] Polling: `verdict` es `null` sin `Transaction`, y devuelve
      `ocrStatus`/`verdict` reales cuando existen; `404` para voucherId
      inexistente.
- [x] Endpoints públicos sin `@UseGuards` (el guard JWT de E03 es
      por-controlador, no global), respuestas sin `businessId`/mailbox.
- [x] Contrato documentado en `research/public-api-contract.md`.
- [x] `pnpm --filter @check/api build`, `typecheck`, `lint` y `test` pasan.

## Notes

- `apps/api` ganó dependencias `bullmq` + `ioredis` (mismas versiones que
  `apps/workers`) y la env `REDIS_URL` (default `redis://localhost:6379`,
  misma instancia Redis que los workers). `.env.example` actualizado.
- Los nombres de cola/job/bucket están duplicados como constantes en
  `apps/api/src/public/public.constants.ts` porque `apps/workers` no exporta
  un paquete compartible; están marcados como CONTRATO con E05-T3 en ambos
  lados. Si se repite un tercer productor, conviene moverlos a
  `packages/shared`.
- El estado del contrato de polling usa los enums reales de Prisma
  (`PROCESSED` en lugar del tentativo `DONE`, etc.) — ver
  `research/public-api-contract.md`.
- Gap conocido del pipeline (NO de esta tarea): `normalizeImage` (sharp,
  Épica 5) no tiene ruta para PDF todavía; un PDF entra a la cola pero
  fallará la normalización y agotará los reintentos del job (voucher queda
  `PENDING`). Relevante para E09-T6 (estados de error).
- El primer test-runner real de `@check/api`: el script `test` pasó de un
  `echo` a `tsx --test` (patrón de `apps/workers`).
- Si el encolado falla (Redis caído), la request devuelve 500 y el cliente
  debe reintentar (el `Voucher` creado queda `PENDING` sin job — deuda menor,
  aceptable hasta E09-T6/T7).
