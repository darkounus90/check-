# E09-T5 Vista de resultado en vivo

## Goal

Que el cliente vea, en la MISMA pantalla donde subió el comprobante
(`/n/{opaqueId}`), el semáforo de verificación actualizándose sin recargar:
🟡 "Verificando…" mientras procesa, y al resolver 🟢 "Pago verificado —
puedes entregar" o 🚨 "No entregues — no pudimos verificar este pago".

## Requirements

- Tras un `POST` exitoso (E09-T3), la misma vista pasa a mostrar el estado
  del comprobante consultando `GET /public/vouchers/:voucherId` vía el
  módulo tipado `apps/web/lib/public-api.ts`.
- Polling en cliente: primer intento inmediato y luego cada ~2.5 s con
  backoff suave (factor 1.25, tope 10 s por ciclo) y ventana total máxima de
  2 minutos. Implementado en el hook
  `apps/web/app/n/[opaqueId]/use-voucher-verdict.ts`.
- Al recibir un veredicto final (`VERIFIED` o `SUSPICIOUS`) el polling se
  detiene; el timer se limpia también al desmontar el componente.
- `verdict: "PENDING"` o `null` se muestran como 🟡 "Verificando…". Si se
  agota la ventana sin veredicto, se muestra un estado amable ("está
  tardando más de lo normal") con botón "Seguir verificando" que reinicia la
  ventana de polling — nunca un falso 🚨.
- Errores de red durante el polling se tratan como transitorios (se
  reintenta en el siguiente ciclo, en silencio); los estados de error finos
  son E09-T6.
- El contenedor de resultado usa `aria-live="polite"` para anunciar el
  cambio de estado. El `voucherId` no se loguea (D3).
- `pnpm --filter @check/web build`, `typecheck` y `lint` deben pasar.

## Acceptance Criteria

- [x] Tras subir, la misma pantalla muestra 🟡 "Verificando…" y cambia a
      🟢/🚨 sin recargar la página.
- [x] El polling arranca al obtener el `voucherId`, respeta ~2.5 s con
      backoff suave y tope de ciclo, y se corta a los 2 minutos.
- [x] Al resolver (VERIFIED/SUSPICIOUS) el polling se detiene; también se
      limpia al desmontar.
- [x] El timeout no muestra un falso 🚨: muestra estado "sigue en proceso"
      con botón "Seguir verificando" que reanuda el polling.
- [x] Mensajes exactos del semáforo: 🟢 "Pago verificado — puedes entregar"
      y 🚨 "No entregues — no pudimos verificar este pago".
- [x] El `voucherId` no aparece en `console.*` ni analytics.
- [x] `pnpm --filter @check/web build`, `typecheck` y `lint` pasan.

## Notes

- Se eligió polling simple (sin Supabase Realtime/WebSockets) por ser la
  opción más robusta para una página pública sin sesión; el contrato
  `GET /public/vouchers/:voucherId` → `{ ocrStatus, verdict }` es el fijado
  para la épica (lo implementa E09-T4 en paralelo; no se probó end-to-end
  contra el API real en esta tarea).
- `ocrStatus` llega en la respuesta pero por ahora no cambia la UI (solo el
  `verdict` decide el semáforo); E09-T6 lo usará para distinguir "foto
  ilegible → sube una mejor foto".
- Los errores HTTP/red durante el polling no rompen la vista: se sigue
  mostrando 🟡 y se reintenta hasta resolver o agotar la ventana.
- Deuda pre-existente: `@check/web` sin test runner, por eso el hook de
  polling no tiene tests unitarios.
