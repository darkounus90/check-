# E07-T1 Instancia Baileys con auth-state en Postgres

## Goal

Levantar una instancia de WhatsApp sobre `@whiskeysockets/baileys` cuyo estado de
autenticación (creds + keys de Signal) se persista en Postgres (no en disco), de modo que
la instancia reconecte tras un reinicio de proceso SIN volver a escanear el QR.

## Requirements

- `@check/whatsapp` (ESM) envuelve Baileys en `WhatsAppInstance` (un número por instancia).
- `useDbAuthState(store, waNumberId)`: equivalente en BD a `useMultiFileAuthState`. Guarda el
  auth-state completo (`{creds, keys}`) como UN blob JSON en `WaSession.authState` vía el
  puerto `WaSessionStore`. Serializa/reviva con `BufferJSON` de Baileys (formato exacto:
  buffers como `{type:"Buffer",data}`), para no corromper el material Signal.
- Persistir el estado en cada `keys.set` y en `creds.update` (`saveCreds`).
- Exponer el QR de vinculación inicial por callback/evento (`onQr`), no por terminal.
- Reconexión automática ante caídas transitorias reutilizando el auth-state; ante logout
  (`DisconnectReason.loggedOut`) NO reconectar (invocar `onLoggedOut`: hará falta nuevo QR).
- Todo envío de texto pasa por UNA función central `sendMessage` (gancho para Grupo B).
- Integrar como proceso gestionado en `apps/workers` (`WhatsAppManager`), activable por env
  (`WHATSAPP_ENABLED`, `WHATSAPP_WA_NUMBER_ID`). Un número/instancia por proceso (multi es E07-T7).
- Interop ESM/CJS: `apps/workers` (CJS) importa `@check/whatsapp` (ESM) igual que el resto de
  packages ESM del monorepo (require(ESM) de Node ≥ 22, probado en 24).

## Acceptance Criteria

- [x] La instancia conecta con un número (emite QR la primera vez).
- [x] Tras un reinicio de proceso, `useDbAuthState` restaura creds+keys y la instancia
      reconecta sin re-escanear QR (cubierto por test de serialize/restore round-trip).
- [x] El auth-state se serializa/reviva con BufferJSON sin corromper los Buffers.
- [x] `pnpm --filter @check/whatsapp build|typecheck|lint|test` verde.

## Notes

- Modelo del schema: `WaNumber` (por número) ↔ `WaSession.authState` (Json, 1:1 por número).
- Tests mockean el socket/store (sin conexión real): round-trip serialize/restore + delete.
