# CHECK

Verificación antifraude de comprobantes de pago para negocios colombianos. CHECK cruza cada comprobante contra el **correo transaccional real** del banco receptor y otras defensas, y le da al cajero un semáforo claro: 🟢 entrega · 🟡 espera · 🚨 no entregues.

> Especificación de producto completa en [`.trellis/spec/prd.md`](.trellis/spec/prd.md). Decisiones de arquitectura en [`.trellis/spec/decisions.md`](.trellis/spec/decisions.md).

## Stack

TypeScript · NestJS · Next.js 15 · Prisma + Supabase (Postgres/RLS) · BullMQ + Redis · Google Cloud Vision · Postmark Inbound · Baileys (WhatsApp) · Turborepo + pnpm.

## Requisitos

- Node.js **>= 20** (probado en 24) · pnpm **11**

## Setup

```bash
pnpm install
cp .env.example .env   # completa según necesites
```

## Comandos (raíz)

| Comando          | Qué hace                                |
| ---------------- | --------------------------------------- |
| `pnpm build`     | Compila todos los proyectos (Turborepo) |
| `pnpm typecheck` | Type-check estricto en todo el monorepo |
| `pnpm lint`      | ESLint en todos los proyectos           |
| `pnpm test`      | Corre los tests de cada paquete         |
| `pnpm dev`       | Modo desarrollo (turbo)                 |
| `pnpm format`    | Formatea con Prettier                   |

Para un solo proyecto: `pnpm --filter @check/api <script>`.

## Estructura del monorepo

```
apps/
  api/        NestJS — API HTTP, webhooks (Postmark, WhatsApp router).  GET /health
  workers/    NestJS standalone — workers de OCR, verificación, warmeo WhatsApp
  web/        Next.js 15 + Tailwind + shadcn/ui — dashboard + PWA fallback
packages/
  shared/     Tipos, schemas Zod, utilidades (dinero en centavos, TZ Bogotá)
  database/   Cliente Prisma compartido (schema + RLS en Épica 2)
  parsers/    Parsers de correos bancarios versionados por banco receptor
  ocr/        Google Vision + extracción estructurada del comprobante
  verifier/   Motor antifraude (las 7 defensas + semáforo)
  whatsapp/   Capa Baileys: instancia, humanización, pool, enrutador
```

## Convenciones

- Dinero: **entero en centavos** (`Cents`), nunca `float`.
- Fechas: se guardan en **UTC**, se muestran en `America/Bogota`.
- Packages en **ESM** (`"type": "module"`); apps NestJS en CommonJS (ver decisión D8).
- Cada parser es versionado (`v1`, `v2`) con fixtures de regresión antes de producción.

## Estado

Planeado por épicas en [`.trellis/tasks/`](.trellis/tasks/). **Épica 1 (setup del monorepo)** completa: scaffolding compilable, TS estricto, lint/format y CI.

## CI

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) corre `install → build → typecheck → lint → test` en cada push y PR.
