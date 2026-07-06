# E12-T4 — Habeas data: export y eliminacion

**Objetivo:** endpoints autenticados/autorizados para exportar y eliminar la info de un titular (Ley 1581/2012).

**Entregado:**
- `HabeasDataService`/`Controller` (apps/api). OWNER-only, acotado al businessId del tenant.
- `POST /habeas-data/export` (descifra ocrText, audita); `DELETE /habeas-data` (borra vouchers+consents, audita, devuelve storagePaths a purgar).

**Aceptación:** dado un titular se exporta y se elimina su info (`habeas-data.service.test.ts`). ✅
