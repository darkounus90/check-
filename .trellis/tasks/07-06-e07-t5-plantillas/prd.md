# E07-T5 Rotación de plantillas de respuesta

## Goal

Reemplazar las plantillas fijas del semáforo (Grupo A) por una ROTACIÓN de 5–8 variantes por
tipo de respuesta, de modo que dos respuestas consecutivas del mismo tipo (al mismo número)
NUNCA sean idénticas. Reduce el patrón repetitivo que dispara detección anti-spam de WhatsApp.

## Requirements

- 5–8 variantes por cada tipo: acuse 🟡 (`ack`), verificado 🟢 (`verified`), sospechoso 🚨
  (`suspicious`). Textos naturales en español colombiano, coherentes con los actuales.
- Selector determinista/testeable `pickTemplate(kind, lastIndex)`: dado el último índice usado
  elige otro (rotación cíclica), garantizando anti-repetición consecutiva con ≥ 2 variantes.
- Estado del último índice por tipo/por número, persistido (para sobrevivir reinicio del
  proceso worker) vía un puerto `TemplateRotationStore`.
- Se engancha en el mismo punto de envío de Grupo A (`sendMessage`/`sendVerdict`), sin tocar
  a los llamadores.

## Acceptance Criteria

- [x] Cada tipo tiene 5–8 variantes distintas entre sí.
- [x] Dos respuestas seguidas del mismo tipo nunca son idénticas (verificado en test).
- [x] `pickTemplate` es puro/determinista y cubre todas las variantes en una vuelta.
- [x] El índice se persiste por (número, tipo) y solo avanza cuando el mensaje sí se envió.
- [x] `pnpm --filter @check/whatsapp build|typecheck|lint|test` verde.

## Notes

- `packages/whatsapp/src/templates.ts`: `TEMPLATES`, `pickTemplate`, `templateKindForVerdict`.
- Puerto `TemplateRotationStore` en `types.ts`; implementación Prisma en `apps/workers`
  (`WhatsAppStore`), persistiendo `lastAckTemplateIndex/lastVerifiedTemplateIndex/
  lastSuspiciousTemplateIndex` en `WaNumber` (migración mínima).
