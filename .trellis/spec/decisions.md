# Decisiones de planeación — CHECK MVP

Decisiones resueltas con el dueño (Andres) el 2026-07-03. Resuelven las ambigüedades del PRD (`prd.md`). El PRD se mantiene verbatim; estas decisiones lo complementan y mandan sobre él ante conflicto de detalle de implementación.

## D1–D2 · Dominio y correo entrante

- **No hay dominio propio todavía.** El MVP arranca con el **buzón entrante gratuito de Postmark Inbound** (`{hash}@inbound.postmarkapp.com`), uno o distinguido por negocio.
- El **dominio y el formato del buzón son configuración**, nunca literales en el código. `check.co` es placeholder.
- Migrar a dominio propio (MX → Postmark) con direcciones tipo `pagos+{opaqueId}@<dominio>` es un cambio de config posterior, sin refactor.
- **Impacto:** Épicas 2 (E02-T4), 3 (E03-T4, E03-T7, E03-T8), 4 (E04-T2).

## D3 · Identificador de negocio en URLs y buzón

- Se usa un **ID opaco no adivinable** (aleatorio) como llave en la URL del QR (`/n/{opaqueId}`) y en el buzón de correo.
- Un slug legible es solo cosmético para el dashboard del dueño; **nunca** es llave de acceso.
- Motivo: las rutas `/n/{...}` son públicas y sin login; deben ser no enumerables.
- **Impacto:** Épicas 3, 8, 9.

## D4 · Defensa 3 — cruce de cuenta destino (match flexible)

- El match de cuenta destino es **flexible**: compara **últimos 4 dígitos** y/o **nombre del beneficiario** contra lo declarado por el negocio.
- Si coincide, **suma confianza**; si no puede leerse del comprobante, **no penaliza** (no baja a 🚨 por sí sola).
- Razón: la Defensa 1 (correo real del banco receptor) ya garantiza que el dinero entró a la cuenta correcta; la Defensa 3 es refuerzo. Umbral configurable.
- **Impacto:** Épica 6 (E06-T5).

## D5 · Defensa 7 — horarios de operación (apagado en MVP)

- **No** se cablean horarios reales por banco en el MVP (los bancos operan transferencias 24/7; señal débil y volátil).
- Queda como **umbral configurable/apagado**. Se prioriza la parte fuerte de la Defensa 7: **mismo cliente con múltiples intentos fallidos en la red**.
- Horarios por banco = mejora post-MVP.
- **Impacto:** Épica 6 (E06-T9).

## D6 · Base global de aprobaciones vs. RLS (solo existencia)

- La consulta cross-tenant de la Defensa 2 responde **solo "existe / no existe"** el número de aprobación en la red, **sin revelar en qué negocio** apareció ni ningún dato de ese negocio.
- Se implementa con función de BD de alcance restringido (lee solo esa tabla, devuelve existencia). Es una lista negra compartida sin fuga de datos entre tenants.
- **Impacto:** Épicas 2 (E02-T11), 6 (E06-T4).

## D7 · Orden de arranque de ejecución (PWA antes que WhatsApp)

- El plan (épicas 1→12) se mantiene, pero la **secuencia de ejecución** prioriza tener un producto demostrable end-to-end lo antes posible, porque todos los flujos convergen en el mismo motor de verificación.
- **Orden de arranque:** `1 → 2 → 3 → 4 → 5 → 6 → 9 (PWA) → 7 (WhatsApp) → 8 (QR/failover) → 10 → 11 → 12`.
- WhatsApp se posterga tras la PWA por su fragilidad (warmeo de 2 semanas, riesgo de baneo); el warmeo de números puede iniciarse en paralelo por fuera del camino crítico.

## D8 · Convención TypeScript (ESM en todo el monorepo)

- La config base (`tsconfig.base.json`) usa `module: NodeNext` + `moduleResolution: NodeNext` + `verbatimModuleSyntax: true` con `strict` completo (`noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, etc.).
- **Consecuencia obligatoria:** cada package y app **debe** declarar `"type": "module"` en su `package.json`. Sin eso, TS infiere CommonJS y falla con `TS1287` en cualquier `export` top-level.
- Cada package/app crea su `tsconfig.json` con `extends: "<ruta>/tsconfig.base.json"`.
- **Excepción — apps NestJS:** `apps/api` y `apps/workers` corren **CommonJS + decoradores** (`module: CommonJS`, `experimentalDecorators`, `emitDecoratorMetadata`, `verbatimModuleSyntax: false`), porque la DI de NestJS depende de `emitDecoratorMetadata` (incompatible con el ESM estricto). Cada una sobreescribe esos flags en su `tsconfig.json` y su `package.json` **no** lleva `"type": "module"`.
- **Excepción — Next.js (`apps/web`):** usa `jsx: preserve`, `moduleResolution: Bundler`, alias `@/*`; el build/type-check lo hace `next build`.
- **Impacto:** todas las tareas que crean packages/apps (E01-T4 a E01-T12) y cualquier paquete futuro.
