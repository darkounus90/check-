# E07-T8 — Asignación multi-tenant número↔negocios

**Épica 7, Grupo C.** Modela y resuelve la asignación de un número a un grupo de negocios
(20–50 pequeños o 5–10 medianos) para ACOTAR EL RADIO DE DAÑO: si un número se degrada/banea,
solo afecta a su grupo, no a toda la red.

## Requisitos

- Usar `NumberPoolAssignment` (N↔M `WaNumber`↔`Business`).
- Resolver negocio→números (a qué grupo de números sirve cada negocio) y número→negocios
  (radio de daño de un número).
- Mejorar la resolución del Grupo A (hoy "el primero"): documentar el mecanismo de
  desambiguación elegido.

## Mecanismo de desambiguación (decisión documentada)

Sin señal por-mensaje del cliente, un número compartido por varios negocios es ambiguo en la
dirección entrante. Se elige:

1. **Negocio→número** (la que importa para enrutar salidas y el QR de la Épica 8): cada
   negocio resuelve a su grupo de números sanos; el QR de un negocio (Épica 8) fija el mapeo
   al dirigir al cliente a un número concreto.
2. **Entrante número→negocio**: resolución determinística por asignación de mayor prioridad
   (empate → la más antigua), como ya hace `resolveBusinessId`. El caso limpio es
   1-número-por-negocio o el QR de Épica 8 que fija el negocio antes de recibir.

## Aceptación

Cada negocio resuelve a su grupo de números; ningún número sirve fuera de su asignación
(`numberServesBusiness` / `numbersForBusiness` respetan el invariante).

## Diseño

- `packages/whatsapp/src/assignment.ts`: funciones puras `numbersForBusiness`,
  `businessesForNumber`, `numberServesBusiness`, `pickHealthyNumberForBusiness` (insumo de la
  Épica 8: elige el número sano preferente del grupo).
- `apps/workers`: `store.listAssignments()` provee las filas para las funciones puras.
- Tests: `packages/whatsapp/test/assignment.test.ts`.
