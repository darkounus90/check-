# E07-T4 Humanización anti-baneo del envío

## Goal

Envolver TODO envío de texto de la instancia WhatsApp (el punto central `sendMessage` de
`WhatsAppInstance`, Grupo A) con comportamiento que imite a una persona, para reducir el
riesgo de baneo por parte de WhatsApp. Nunca hay outbound espontáneo: la humanización solo
retrasa/pospone un envío que YA fue disparado por un mensaje entrante o por un veredicto.

## Requirements

- Antes de enviar: delay aleatorio 1–4s.
- Durante el delay: presencia "escribiendo…" (`sendPresenceUpdate('composing')`), pausada
  (`paused`) justo antes de entregar.
- Al recibir un mensaje entrante: marcarlo como leído (`readMessages`) con un pequeño delay.
- Respetar el horario del negocio: fuera de la ventana configurada NO se responde (el envío
  se pospone; el poller de veredictos reintenta más tarde y el 🟡 sigue vigente).
- Diseño testeable: reloj (`clock`), aleatoriedad (`random`) y espera (`sleep`) INYECTABLES.
  Prohibido `Date.now()`/`Math.random()`/`setTimeout` directos sin inyección: en test se fijan.
- Se engancha en el único `sendMessage` central de Grupo A, sin tocar los llamadores.

## Acceptance Criteria

- [x] Las respuestas exhiben: leído-con-delay, "escribiendo…", delay 1–4s, y entrega.
- [x] Fuera de horario del negocio NO se envía (devuelve `false`, se pospone).
- [x] Sin outbound sin trigger: el módulo solo entrega lo que se le pide, nunca origina.
- [x] Reloj/aleatoriedad/sleep inyectados y verificados deterministamente en test.
- [x] `pnpm --filter @check/whatsapp build|typecheck|lint|test` verde.

## Notes

- `packages/whatsapp/src/humanizer.ts`: `Humanizer` + `isWithinBusinessHours`/`localHourOf`.
- Horario del negocio soporta ventanas normales (8–20) y que cruzan medianoche (20–6), con
  offset de TZ (Colombia = -300) para no depender de la TZ del proceso.
- Enganche en `packages/whatsapp/src/instance.ts` (`sendMessage`, `markReadHumanized`).
- Config por env en workers: `WHATSAPP_BUSINESS_START_HOUR/END_HOUR/UTC_OFFSET_MINUTES`.
