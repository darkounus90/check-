# Épica 1 — Setup del monorepo

**Objetivo:** dejar el monorepo Turborepo + pnpm en pie, con todas las apps y packages como esqueletos compilables en TypeScript estricto y un CI básico verde. **No** se implementa lógica de negocio aquí.

**Dependencias:** ninguna. Es la primera épica; todo lo demás depende de esta.

**Criterio de aceptación de la épica:** `pnpm install && pnpm build && pnpm typecheck && pnpm lint` corre en verde desde la raíz; cada app/package tiene un esqueleto que compila; el CI corre esos comandos en cada push.

## Mapa de subtareas

Leyenda: `[∥]` puede correr en paralelo con las demás `[∥]` del mismo grupo · `[→]` depende de lo anterior.

### Grupo A — cimientos (secuencial)

- **E01-T1 [→]** Inicializar workspace pnpm + Turborepo en la raíz. **Aceptación:** existen `package.json` raíz, `pnpm-workspace.yaml` (apunta a `apps/*` y `packages/*`) y `turbo.json` con pipelines `build`, `lint`, `typecheck`, `test`; `pnpm install` corre sin error.
- **E01-T2 [→]** Config base de TypeScript estricto compartida. **Aceptación:** existe `tsconfig.base.json` con `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`; cada paquete lo extiende.
- **E01-T3 [→]** Tooling de calidad transversal: ESLint + Prettier + import ordering. **Aceptación:** `pnpm lint` corre en toda la raíz sin error sobre los esqueletos.

### Grupo B — scaffolding de packages (paralelizable tras Grupo A)

- **E01-T4 [∥]** Esqueleto `packages/shared` (tipos, placeholder de schemas Zod, utilidades). **Aceptación:** exporta al menos un tipo y compila; consumible por otro paquete vía import.
- **E01-T5 [∥]** Esqueleto `packages/database` (placeholder de cliente Prisma, sin schema real). **Aceptación:** exporta un cliente placeholder tipado y compila.
- **E01-T6 [∥]** Esqueleto `packages/parsers` (interfaz `BankEmailParser` + registro vacío). **Aceptación:** define contrato de parser versionado y compila.
- **E01-T7 [∥]** Esqueleto `packages/ocr` (interfaz `OcrProvider` placeholder). **Aceptación:** define contrato y compila.
- **E01-T8 [∥]** Esqueleto `packages/verifier` (interfaz `Defense` + tipo `Verdict` placeholder). **Aceptación:** define contratos y compila.
- **E01-T9 [∥]** Esqueleto `packages/whatsapp` (interfaces `WhatsAppInstance`/`Router` placeholder). **Aceptación:** define contratos y compila.

### Grupo C — scaffolding de apps (paralelizable tras Grupo B)

- **E01-T10 [∥]** Esqueleto `apps/api` (NestJS, health-check `GET /health`). **Aceptación:** `pnpm --filter api start` levanta y `/health` responde 200.
- **E01-T11 [∥]** Esqueleto `apps/workers` (NestJS standalone, proceso worker vacío). **Aceptación:** el proceso arranca y loguea "workers up" sin crashear.
- **E01-T12 [∥]** Esqueleto `apps/web` (Next.js 15 + Tailwind + shadcn/ui, página raíz). **Aceptación:** `pnpm --filter web dev` sirve la home; Tailwind y un componente shadcn renderizan.

### Grupo D — cierre (secuencial)

- **E01-T13 [→]** Variables de entorno tipadas + `.env.example` por app. **Aceptación:** validación de env (Zod) que falla si falta una var requerida; `.env.example` documenta todas.
- **E01-T14 [→]** CI básico (GitHub Actions) que corre `install/build/lint/typecheck/test`. **Aceptación:** el workflow corre en push/PR y queda verde sobre el estado actual del repo.
- **E01-T15 [→]** README raíz con comandos del monorepo y mapa de apps/packages. **Aceptación:** documenta instalar, correr cada app y correr los checks.
