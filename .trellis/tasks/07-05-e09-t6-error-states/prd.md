# E09-T6 Estados de error y reintento

## Goal

Cerrar el flujo público de la PWA (Épica 9) frente a comprobantes ilegibles y
timeouts: cuando el OCR no puede leer la foto (o el comprobante no se reconoce),
el cliente ve un mensaje accionable ("La foto no se ve bien, toma otra más
clara") con botón para reintentar la subida SIN recargar — nunca un falso 🚨.
Incluye tapar el gap conocido de PDF del pipeline de OCR, que hoy deja el
comprobante colgado en `ocrStatus=PENDING` para siempre.

## Requirements

- El front distingue por `ocrStatus` (enum Prisma `OcrStatus`:
  `PENDING | PROCESSED | LOW_QUALITY | FAILED`) además del `verdict`:
  - `LOW_QUALITY`/`FAILED` → pedir mejor foto con reintento (no es 🚨).
  - `verdict = "SUSPICIOUS"` → 🚨. `verdict = "VERIFIED"` → 🟢.
  - `PROCESSED`/`PENDING` con verdict pendiente o nulo → 🟡 (seguir polleando).
- El polling (`use-voucher-verdict.ts`) expone `ocrStatus`, se detiene al
  detectar `LOW_QUALITY`/`FAILED` (no tiene sentido seguir esperando un
  veredicto que nunca llegará) y no loguea el voucherId (D3).
- La vista de resultado (`voucher-flow.tsx`) muestra el estado "pedir mejor
  foto" con prioridad sobre el 🟡, y el botón "Tomar otra foto" vuelve a la
  pantalla de captura SIN recargar (limpia el voucherId para detener/reiniciar
  el polling con la próxima subida).
- El contrato del front se centraliza en `lib/public-api.ts` (tipo
  `VoucherOcrStatus`, helper `isImageProblemStatus`).
- **Gap de PDF (opción a, la menos invasiva)**: el pipeline de OCR
  (`packages/ocr` `normalizeImage` con sharp) no maneja PDF; un PDF entra a la
  cola, sharp lanza y el job agota reintentos dejando el voucher en `PENDING`.
  Se detecta el PDF por la extensión de `storagePath` en el worker
  (`isUnsupportedByOcrPipeline` en `packages/ocr`) ANTES de descargar/normalizar
  y se marca `LOW_QUALITY` (falla permanente de negocio, no se reintenta), de
  modo que el front lo trata igual que una foto ilegible y pide una foto.
- Timeout: la ventana de polling de 2 min ya evita el falso 🚨; al expirar
  ofrece "Seguir verificando" (verificado, copy conservada).
- `build`/`typecheck`/`lint`/`test` de los packages tocados pasan.

## Acceptance Criteria

- [x] Una foto ilegible/no reconocida (`LOW_QUALITY`/`FAILED`) muestra "La foto
      no se ve bien, toma otra más clara" con botón "Tomar otra foto" que
      reintenta SIN recargar; nunca un falso 🚨.
- [x] Un PDF ya no cuelga el voucher en `PENDING`: el worker lo marca
      `LOW_QUALITY` antes de tocar Storage/sharp y el front pide una foto
      (verificado con test en `apps/workers/test/ocr.service.test.ts` y
      `packages/ocr/test/preprocess.test.ts`).
- [x] El polling se detiene en `LOW_QUALITY`/`FAILED` y expone `ocrStatus`;
      el timeout de 2 min sigue ofreciendo reintentar sin falso 🚨.
- [x] Ni el opaqueId ni el voucherId se loguean (D3).
- [x] `pnpm --filter @check/web build|typecheck|lint`,
      `pnpm --filter @check/ocr build|typecheck|lint|test` y
      `pnpm --filter @check/workers build|typecheck|lint|test` pasan.

## Notes

- Se eligió la opción (a) del gap de PDF (marcar `LOW_QUALITY` en el worker) en
  vez de (b) rechazar PDF con 415 en la subida, porque el contrato ya
  construido (E09-T3/T4) anuncia PDF como aceptado en la UI, el cliente
  `lib/public-api.ts` y la API (`ALLOWED_VOUCHER_MIME_TYPES`). La opción (b)
  obligaría a revertir esa decisión en front + api + copy; la opción (a) es un
  cambio acotado en el worker + un helper de `packages/ocr`, reusa la ruta de
  "pedir mejor foto" que el front necesitaba de todas formas para `LOW_QUALITY`
  y no toca el contrato público. Cuando exista soporte real de PDF, la guarda
  `isUnsupportedByOcrPipeline` desaparece y se añade la ruta de rasterizado.
- La copy del cliente vive en el front (`voucher-flow.tsx`); el worker persiste
  una nota en `ocrText` ("PDF no soportado…") solo para el operador.
- `@check/web` sigue sin test runner (deuda pre-existente de E09-T1); la lógica
  nueva del front se cubre por typecheck + build de Next. Los cambios con
  comportamiento (worker/ocr) sí llevan tests.
