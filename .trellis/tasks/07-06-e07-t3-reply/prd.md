# E07-T3 Respuesta del semaforo por WhatsApp

## Goal

Responder el semáforo al cliente en el chat de origen: un acuse 🟡 al recibir el
comprobante y, cuando la `Transaction` del voucher se resuelve, el veredicto final
🟢 (VERIFIED) o 🚨 (SUSPICIOUS). Todo envío pasa por UNA función central `sendMessage`.

## Requirements

- Al recibir el comprobante (E07-T2), responder inmediatamente:
  🟡 "Estamos verificando tu comprobante…" (`ACK_TEMPLATE`).
- Al resolverse el veredicto:
  - VERIFIED → 🟢 "Pago verificado ✅ Ya puedes entregar el pedido".
  - SUSPICIOUS → 🚨 "⚠️ No pudimos verificar este pago. NO entregues el pedido y confirma
    con el negocio".
- Selección de plantilla por veredicto en `renderVerdictMessage` (pura, testeable). Grupo A
  usa una plantilla fija por estado; la rotación anti-repetición es E07-T5.
- Enganche al veredicto de la forma MENOS invasiva: el worker de verificación (E06) solo hace
  `update` de la `Transaction` (fija `verdict` + `resolvedAt`); NO hay cola de salida. Se usa
  un poller (`WhatsAppManager`) que sondea las `Transaction` resueltas (VERIFIED/SUSPICIOUS)
  cuyo comprobante vino por WhatsApp y aún no se respondió (`WaVoucherContext.notifiedAt=null`),
  responde y marca `notifiedAt`. No se toca el módulo de verificación.
- Responder al chat de origen usando el `WaVoucherContext` (JID + waNumberId) del voucher.

## Acceptance Criteria

- [x] El cliente recibe 🟡 al enviar el comprobante.
- [x] El cliente recibe 🟢/🚨 en el chat de origen cuando el veredicto se resuelve.
- [x] La respuesta es idempotente (no se responde dos veces el mismo comprobante).
- [x] Selección de plantilla por veredicto cubierta por test.
- [x] `pnpm --filter @check/whatsapp` y `@check/workers` (build|typecheck|lint|test) verde.

## Notes

- `sendVerdict(voucherId, verdict)` lee el contexto y responde solo si el comprobante lo
  recibió esta misma instancia (`waNumberId` coincide). PENDING no dispara respuesta final:
  mientras espera se mantiene el 🟡 ya enviado.
- Poller: intervalo 15s, batch 25, sin solapamiento de ciclos; marca `notifiedAt` solo si el
  envío tuvo éxito (reintenta al siguiente ciclo si falla).
