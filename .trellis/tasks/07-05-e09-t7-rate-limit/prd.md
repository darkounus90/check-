# E09-T7 Anti-abuso rate limit

## Goal

Proteger los endpoints públicos de la PWA (Épica 9, `apps/api/src/public`)
contra floods sin estorbar el uso legítimo. Un cliente sube 1-3 comprobantes y
el polling corre cada ~2.5 s durante ≤2 min; el rate limit debe frenar el abuso
por IP y por negocio (opaqueId) dejando pasar ese patrón.

## Requirements

- Usar el enfoque idiomático de NestJS: `@nestjs/throttler` (agregado a
  `@check/api`), tres throttlers nombrados registrados en `public.module.ts`.
- El `ThrottlerGuard` se aplica a nivel de `PublicController` con `@UseGuards`
  (NO como `APP_GUARD`, que en Nest siempre es global y throttlearía toda la
  API); solo protege las rutas públicas.
- Límites (ventana de 1 min), centralizados en `public.constants.ts`
  (`PUBLIC_RATE_LIMITS`):
  - Ingesta (`POST /public/n/:opaqueId/vouchers`): **10/min por IP** +
    **30/min por negocio** (tracker por `opaqueId` de la URL, para frenar un
    flood distribuido contra un mismo enlace).
  - Polling (`GET /public/vouchers/:voucherId`): **60/min por IP** (generoso;
    ~48 requests legítimas por voucher en 2 min).
  - Identificación (`GET /public/n/:opaqueId`): sin rate limit (lectura barata,
    una vez al abrir el enlace).
- Cada ruta selecciona sus throttlers con `@SkipThrottle` (con throttlers
  nombrados, `@SkipThrottle()` sin argumentos NO saltea nada: hay que listar
  los nombres a excluir).
- Exceder un límite → `429` con cabecera `Retry-After-<throttler>` (la pone el
  guard; con throttlers nombrados el header lleva el sufijo del throttler).
- D3: el `opaqueId` solo alimenta la clave interna de conteo del throttler;
  nunca se loguea.
- Tests (`apps/api/test/*.test.ts`, node:test + tsx) que verifiquen 429 pasado
  el umbral y 200/201 bajo el umbral, sin BD/Redis/Supabase reales.

## Acceptance Criteria

- [x] La ingesta responde `201` hasta el umbral por IP (10) y `429` con
      `Retry-After-public-ingest-ip` en la request 11 (test
      `public-rate-limit.test.ts`).
- [x] El polling admite un puñado de requests legítimas sin `429` (throttler
      propio de 60/min, independiente de la ingesta).
- [x] La identificación del negocio no se throttlea aunque se repita.
- [x] El rate limit vive aislado en `PublicModule`/`PublicController`; el resto
      de la API no queda throttleada.
- [x] `pnpm --filter @check/api build|typecheck|lint|test` pasan.

## Notes

- `getTracker` del throttler por negocio se define en `public.module.ts` (no un
  guard custom): devuelve `business:<opaqueId>` cuando existe el parámetro de
  ruta y cae a `req.ip` en otro caso. Es más simple que subclasear
  `ThrottlerGuard`.
- Se añadió `@Inject(PublicVouchersService)` explícito al constructor de
  `PublicController`: además de idiomático, permite resolver la dependencia sin
  `design:paramtypes` (los tests corren bajo tsx/esbuild, que no emite metadata
  de tipos de constructor). El resto de servicios ya usaban `@Inject`.
- El test levanta una app Nest real por caso (contador en memoria limpio) con
  Prisma/Storage/cola FAKE; no requiere infraestructura externa.
- Storage por defecto en memoria (single-instance). Si `apps/api` escala a
  múltiples réplicas, migrar a `ThrottlerStorageRedis` sobre el `REDIS_URL` ya
  configurado; fuera del alcance de esta tarea.
