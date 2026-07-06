# Contrato de la API pública de la PWA (Épica 9 — E09-T2/T4)

Implementado en `apps/api/src/public/` (`PublicModule` → `PublicController`).
Endpoints **sin JWT** (los guards de auth de E03 se aplican por controlador con
`@UseGuards`; este controlador no los declara). La seguridad de datos es
server-side: el negocio se resuelve por `opaqueId` y las respuestas nunca
incluyen el `businessId` interno ni el buzón.

## 1. Identificación del negocio (E09-T2)

```
GET /public/n/:opaqueId
```

- `200` → `{ "name": string }` — SOLO el nombre del negocio.
- `404` → opaqueId inexistente (`{"message":"Negocio no encontrado", ...}` formato estándar de Nest).

Sin listado/enumeración: no existe endpoint que liste negocios; el `opaqueId`
es un cuid no adivinable (`Business.opaqueId`, D3).

## 2. Ingesta pública de comprobante (E09-T4)

```
POST /public/n/:opaqueId/vouchers
Content-Type: multipart/form-data  (campo: file)
```

- Tipos aceptados: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
- Tamaño máximo: **10 MB** (límite de multer en el interceptor + defensa en el servicio).
- `201` → `{ "voucherId": string }` — cuid del `Voucher` creado; es el handle
  público para el polling (punto 3).
- `400` → falta el campo multipart `file`.
- `404` → opaqueId inexistente (se evalúa ANTES que el tipo de archivo).
- `413` → archivo > 10 MB (`PayloadTooLargeException`).
- `415` → tipo MIME no soportado (`UnsupportedMediaTypeException`).

Pipeline (idéntico al resto de canales, Épicas 5/6):

1. Sube el archivo al bucket privado de Supabase Storage `vouchers`, ruta
   `{businessId}/{uuid}.{ext}` (la ruta NO se expone al cliente).
2. Crea el `Voucher` (`businessId` resuelto server-side, `storagePath`,
   `ocrStatus = PENDING` por default).
3. Encola el job en BullMQ: cola `ocr-processing`, job `ocr`, payload
   `{ voucherId }`, `attempts: 3`, backoff exponencial 5 s — exactamente el
   mismo contrato que consume `apps/workers` (E05-T3). El worker de OCR encola
   después la verificación antifraude (E06-T12) por sí solo.

## 3. Polling del estado (E09-T4/T5)

```
GET /public/vouchers/:voucherId
```

- `200` → `{ "ocrStatus": OcrStatus, "verdict": VerdictStatus | null }`
- `404` → voucherId inexistente.

**Enums reales del schema Prisma** (difieren de los nombres tentativos
`PROCESSING`/`DONE` del borrador del contrato — se usan los valores reales,
como el propio contrato exigía):

- `ocrStatus` (enum `OcrStatus`): `"PENDING" | "PROCESSED" | "LOW_QUALITY" | "FAILED"`
  - `PENDING` = aún no procesado (equivale al `PROCESSING` del borrador).
  - `PROCESSED` = OCR + extracción exitosos (equivale a `DONE`).
  - `LOW_QUALITY` = foto ilegible → la PWA debe pedir mejor foto (E09-T6).
  - `FAILED` = comprobante no reconocido (falla permanente).
- `verdict` (enum `VerdictStatus` de la `Transaction`):
  `"VERIFIED" | "PENDING" | "SUSPICIOUS"`, o `null` si la verificación aún no
  creó la `Transaction` (semáforo 🟡).

Mapeo de semáforo sugerido para la PWA:

| Estado                                   | Semáforo                  |
| ---------------------------------------- | ------------------------- |
| `verdict = "VERIFIED"`                   | 🟢                        |
| `verdict = "SUSPICIOUS"`                 | 🚨                        |
| `verdict = "PENDING"` o `null`           | 🟡 (seguir polleando)     |
| `ocrStatus = "LOW_QUALITY"`              | pedir mejor foto (E09-T6) |
| `ocrStatus = "FAILED"`                   | error / reintento         |

## Notas de entorno

- `apps/api` ahora requiere `REDIS_URL` (default `redis://localhost:6379`),
  la MISMA instancia Redis que `apps/workers`.
- El bucket `vouchers` debe existir en Supabase Storage (privado).
- Limitación conocida: el worker de OCR (`normalizeImage`, sharp) todavía no
  tiene ruta para PDF; un PDF ingresa al pipeline pero fallará la
  normalización y agotará reintentos (queda `PENDING`). Gap del pipeline
  (Épica 5), no de este endpoint.
- Rate limiting por negocio/IP: E09-T7 (pendiente); se montará sobre
  `PublicController` sin tocar la lógica.
