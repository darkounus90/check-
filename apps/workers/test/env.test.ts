import assert from "node:assert/strict";
import { test } from "node:test";

// Vars dummy para que el singleton `env` (efecto de import a nivel de módulo) no
// explote al cargar "../src/env" por primera vez en este proceso de test.
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/check";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "dummy-secret";

test("loadEnv falla con mensaje claro si REDIS_URL falta (arranque no debe dar error críptico)", async () => {
  const { loadEnv } = await import("../src/env");

  assert.throws(
    () =>
      loadEnv({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/check",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "dummy-secret",
      }),
    /REDIS_URL/,
  );
});

test("loadEnv acepta una configuración completa y válida", async () => {
  const { loadEnv } = await import("../src/env");

  const env = loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/check",
    REDIS_URL: "redis://localhost:6379",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "dummy-secret",
  });

  assert.equal(env.REDIS_URL, "redis://localhost:6379");
  assert.equal(env.NODE_ENV, "test");
});

test("loadEnv rechaza REDIS_URL con formato inválido (no una URL)", async () => {
  const { loadEnv } = await import("../src/env");

  assert.throws(
    () =>
      loadEnv({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/check",
        REDIS_URL: "no-es-una-url",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "dummy-secret",
      }),
    /REDIS_URL/,
  );
});
