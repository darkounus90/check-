# E01-T13 · Env tipado + .env.example

## Goal
Validación de variables de entorno con Zod por app; `.env.example` documentado.

## Acceptance Criteria
- [x] `apps/api/src/env.ts` y `apps/workers/src/env.ts` validan `process.env` con Zod y exportan un `env` tipado.
- [x] Arranque con env válido funciona (api `/health` 200; workers `workers up (env=development)`).
- [x] Env inválido **falla al arranque** con mensaje claro (verificado: `PORT=abc` → `[api] Config de entorno inválida`, exit 1).
- [x] `.env.example` en raíz y por app documentando las vars (actuales y futuras por épica).

## Notes
- `.env` está en `.gitignore`; `.env.example` versionado.
- Vars de servicios externos (DATABASE_URL, SUPABASE_*, POSTMARK_*, GOOGLE_*) documentadas como comentarios; se activan en sus épicas.
