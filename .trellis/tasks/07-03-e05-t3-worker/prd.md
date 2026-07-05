# E05-T3 Worker OCR + persistencia

## Goal

Implementar en `apps/workers` un worker real (BullMQ + Redis) que consuma un job de OCR por `Voucher`, corra el pipeline completo (`normalizeImage → GoogleVisionProvider.recognize → detectIssuerBank/extractVoucher → assessOcrQuality`) y persista el resultado en el modelo `Voucher` (ya tiene los campos: `ocrText`, `issuerBank`, `amountCents`, `approvalNumber`, `paidAt`, `destinationAccount`, `beneficiary`).

## Requirements

- **Contexto crítico de scope:** hoy NO existe en todo el repo ningún código que cree un `Voucher`, ni ninguna integración con Supabase Storage (ni subida ni descarga). El "buzón"/WhatsApp/PWA que subirán la imagen real son de otras épicas (7, 9) que aún no se implementan. Esta tarea NO debe implementar el canal de subida — solo debe dejar: (a) una función/servicio de descarga de Storage reutilizable, (b) la cola + processor, y (c) un método explícito para encolar un job (`enqueueVoucherOcr(voucherId)`) que las épicas de canal (7/9) invocarán más adelante. Verificar con un test que crea un `Voucher` fixture directo en BD (o fake) y llama `enqueueVoucherOcr` → el processor corre y persiste el resultado.
- Agregar `bullmq` e `ioredis` (o cliente Upstash compatible) a `apps/workers/package.json`; agregar `@check/ocr` y `@check/database` como dependencias del worker. El worker ya es una app Nest (`NestFactory.createApplicationContext`) pero su `package.json` no tiene ninguna de esas dependencias todavía.
- Crear un `PrismaService`/`DatabaseModule` en `apps/workers/src/database/` replicando el patrón ya usado en `apps/api/src/database/prisma.service.ts` (no reinventar; copiar convención) — no usar el singleton `getPrismaClient()` de `@check/database` para mantener consistencia con `apps/api`.
- Descarga de Storage: no existe ningún cliente de Supabase Storage en el repo. Implementar una función mínima de descarga por REST (`GET {SUPABASE_URL}/storage/v1/object/{bucket}/{path}` con `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`), siguiendo el mismo patrón minimalista ya usado en `apps/api/src/supabase/supabase-admin.service.ts` (fetch directo a la REST API, sin el SDK `@supabase/supabase-js`). Agregar `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (mismo nombre que en `apps/api/src/env.ts`) al `env.ts` de `apps/workers` si no están.
- Definir la cola `ocr-processing` (nombre configurable/constante compartida si aplica) y un `Processor`/consumer Nest que reciba `{ voucherId }` como payload del job.
- El processor: lee el `Voucher` por id, descarga los bytes de la imagen desde su `storagePath` (vía la función de Storage de arriba), corre el pipeline de `@check/ocr`, y actualiza el `Voucher` con los campos extraídos + `ocrText`.
- **Falta un campo de estado de calidad OCR en el modelo `Voucher`** (hoy no existe ninguno; `VerdictStatus` es del `Transaction`, de la Épica 6, un concepto distinto). Agregar un campo nuevo, p. ej. `ocrStatus` (enum: `PENDING`, `PROCESSED`, `LOW_QUALITY`, `FAILED`) al modelo `Voucher` en `packages/database/prisma/schema.prisma`, y crear la migración correspondiente con `prisma migrate dev` (convención D9 en `.trellis/spec/decisions.md` — no usar `db push`). Si la calidad es baja (`assessOcrQuality`), marcar `LOW_QUALITY` (no lanzar error, no tocar ningún veredicto — eso no existe aún en esta épica).
- `apps/workers/src/env.ts`: `REDIS_URL` pasa de opcional a **requerido** a partir de esta tarea (ya lo anticipaba el comentario existente "requerida en la Épica 5+").
- Seguir el patrón de módulo Nest ya usado en el repo: replicar la estructura de `apps/api/src/ingestion/` (`*.module.ts` + `*.service.ts`, con un processor/consumer en vez de controller) para el nuevo módulo de OCR en `apps/workers/src/ocr/`, y registrarlo en `apps/workers/src/app.module.ts` (hoy vacío, con comentario explícito de que aquí van los módulos de las Épicas 5/6/7).
- Reintentos: configurar backoff de BullMQ para fallos transitorios (red, Vision caído); no reintentar infinitamente.
- No hay instancia real de Redis/Upstash ni credencial de Storage real disponible todavía (deuda pendiente para el dueño del producto) — el código debe quedar completo y correcto; los tests unitarios deben cubrir la lógica del processor de forma aislada (inyectando fakes para: descarga de Storage, `OcrProvider`, cliente Prisma), sin requerir Redis real corriendo ni credenciales reales. La verificación end-to-end contra Redis/Storage reales queda como deuda a resolver cuando el dueño provea Upstash y confirme el bucket de Storage.

## Acceptance Criteria

- [x] La función/lógica del processor, probada de forma aislada (inyectando dependencias fake: descarga de imagen, `OcrProvider`, cliente Prisma), produce la actualización correcta del `Voucher` para un comprobante reconocible.
- [x] Un comprobante de baja calidad hace que el processor marque "pedir mejor foto" en vez de fallar o marcar sospechoso.
- [x] Un error transitorio (ej. Vision falla) no persiste datos parciales corruptos y permite reintento vía BullMQ.
- [x] `pnpm --filter @check/workers test` pasa.
- [x] `pnpm --filter @check/workers build` y `typecheck` pasan.
- [x] `REDIS_URL` ausente falla rápido y con mensaje claro al arrancar `apps/workers` (falla de validación de env, no error críptico).

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
