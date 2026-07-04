# E01-T9 · Esqueleto packages/whatsapp

## Goal
Interfaces `WhatsAppInstance` / `WhatsAppRouter` placeholder; compila.

## Acceptance Criteria
- [x] `@check/whatsapp` compila y emite tipos.
- [x] Exporta `WhatsAppInstance` (`phoneNumber`, `health`, `sendText`), `WhatsAppRouter` (`resolveActiveNumber`), y `NumberHealth`.
- [x] `"type": "module"` declarado (D8).

## Notes
- Implementado en `packages/whatsapp/`. La capa Baileys real (multi-número, humanización, warmeo, pool, health checks) llega en la Épica 7; el enrutador de QR con failover y fallback PWA en la Épica 8.
