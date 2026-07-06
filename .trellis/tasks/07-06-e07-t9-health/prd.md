# E07-T9 — Health checks por número cada 60s

**Épica 7, Grupo C.** Chequeo periódico por número (conectado/baneado/degradado) persistido
en `WaNumber.health`, alimentado por los eventos de Baileys.

## Requisitos

- Chequeo cada 60s por número; estado persistido en `WaNumber.health` (el enum `NumberHealth`
  ya existe en el schema: WARMING/CONNECTED/DEGRADED/BANNED — sin migración).
- Detectar desconexión/baneo desde `connection.update` + `DisconnectReason` de Baileys.
- Exponer `getPoolHealth()` que la Épica 8 (selección de número sano) consumirá.

## Mapeo DisconnectReason → salud

- `loggedOut` / `forbidden` / `multideviceMismatch` / `badSession` ⇒ **banned** (sesión ya no
  sirve; requiere nuevo QR/reemplazo; no reconecta).
- `connectionClosed` / `connectionLost` / `timedOut` / `connectionReplaced` /
  `restartRequired` / desconocido ⇒ **degraded** (caída transitoria; reconecta sola).
- `connection: "open"` ⇒ **connected**. Antes de la primera conexión ⇒ **warming**.

## Aceptación

El estado de cada número es consultable y se actualiza cada 60s.

## Diseño

- `packages/whatsapp/src/health.ts`: `healthFromDisconnect` (mapeo puro), `HealthMonitor` con
  `IntervalScheduler` y `intervalMs` (60s) inyectables (tick disparable a mano en test).
- `packages/whatsapp/src/instance.ts`: la instancia mantiene `health()` en memoria desde los
  eventos de Baileys.
- `packages/whatsapp/src/pool.ts`: `getPoolHealth()` + `currentHealth(id)` (probe).
- `apps/workers`: `store.saveHealth` persiste en `WaNumber.health`; `store.getPoolHealth()` es
  la consulta persistida para la Épica 8. El `WhatsAppManager` arranca el `HealthMonitor`.
- Tests: `packages/whatsapp/test/health.test.ts` (+ mapeo verificado en pool/instance).
