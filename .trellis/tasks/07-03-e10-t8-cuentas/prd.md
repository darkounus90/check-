# E10-T8 — Cuentas receptoras + onboarding del buzón

Épica 10, Grupo C (dueño). Nueva ruta `dashboard/cuentas` + ítem de nav (solo dueño).

## Goal

Que el dueño gestione sus cuentas receptoras y vea/actualice el estado del buzón de
reenvío de correo.

## Requirements

- [x] Solo dueño: redirige a un cajero por URL directa. La autoridad de escritura vive en
      la API (`RolesGuard` en `/accounts` y `/onboarding/mailbox/refresh`); la UI la refleja.
- [x] Listar cuentas (`GET /accounts`), crear (`POST /accounts`) y eliminar
      (`DELETE /accounts/:id`) vía Server Actions.
- [x] Estado del buzón (`GET /onboarding/mailbox`): correo, estado (🟢/🟡), instrucciones
      de reenvío por banco, y botón "ya configuré" (`POST /onboarding/mailbox/refresh`).
- [x] Estados vacío/error; feedback por notificación in-app.

## Endpoints de apps/api consumidos (existentes)

`GET /accounts`, `POST /accounts`, `DELETE /accounts/:id`, `GET /onboarding/mailbox`,
`POST /onboarding/mailbox/refresh`. No se tocó el backend.

## Acceptance criteria

- [x] El dueño gestiona cuentas y ve el estado del reenvío; un cajero no accede.
- [x] `pnpm --filter @check/web build|typecheck|lint` en verde.

## Files

- `apps/web/app/(dashboard)/dashboard/cuentas/page.tsx`
- `apps/web/app/(dashboard)/dashboard/cuentas/accounts-view.tsx`
- `apps/web/lib/data/mailbox.ts`
- `apps/web/app/(dashboard)/actions.ts` (create/delete/refresh/refetch)
- `apps/web/app/(dashboard)/nav-config.ts` (ítem "Cuentas")
