/**
 * Preload de tests (Épica 11): fija variables de entorno dummy ANTES de que cualquier módulo
 * bajo test importe `../src/env` (validado con zod al cargar). Se engancha vía
 * `tsx --test --import ./test/setup-env.ts`. Usa `??=` para no pisar un `.env` real ya
 * cargado en el shell (los tests que tocan la BD real siguen usando el `.env` del entorno).
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/check";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "dummy-secret";
process.env.REDIS_URL ??= "redis://localhost:6379";
