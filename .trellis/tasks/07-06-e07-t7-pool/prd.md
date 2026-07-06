# E07-T7 — Orquestador multi-instancia del pool

**Épica 7, Grupo C.** Generaliza el manejo de UNA instancia Baileys (Grupo A) a N números
corriendo en paralelo dentro de `apps/workers`, cada uno como una `WhatsAppInstance` aislada
con su propio auth-state persistido.

## Requisitos

- Levantar/bajar N números como instancias gestionadas y aisladas.
- Cada número = una `WhatsAppInstance` con su auth-state (E07-T1).
- Arranque: levantar las instancias de los `WaNumber` activos y elegibles (pasaron warmeo,
  `isPoolEligible` / no baneados).
- Aislamiento: la caída de una instancia NO tumba las demás (arranque, envío y parada
  aislados por número).

## Aceptación

Varios números corren en paralelo de forma aislada: si una instancia falla al arrancar o al
cerrar, el resto siguen operativas.

## Diseño

- `packages/whatsapp/src/pool.ts`: `WhatsAppPool` con `instanceFactory` inyectable (mockeable
  en test sin Baileys/BD). `start`/`stopAll`/`add`/`remove` usan `Promise.allSettled` para
  aislar fallos. `sendVerdict(waNumberId, …)` enruta a la instancia dueña.
- `apps/workers`: `WhatsAppManager` construye el pool con una factory que cablea los puertos
  Prisma/Storage por número; `store.listPoolableNumberIds()` da la lista de arranque.
- Tests: `packages/whatsapp/test/pool.test.ts` (arranque N, aislamiento de fallo, idempotencia,
  enrutado de veredicto, stopAll aislado).
