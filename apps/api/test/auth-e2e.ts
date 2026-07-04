/**
 * E2E de auth (E03-T1, ruta positiva) contra Supabase real + la api local.
 * Crea un usuario confirmado (Admin API), inicia sesión, llama a /me y lo borra.
 * NO imprime tokens ni keys — solo PASS/FAIL y campos no sensibles.
 *
 * Requiere api corriendo y en el env: SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, API_URL (default http://localhost:3021).
 */
const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_URL = process.env.API_URL ?? "http://localhost:3021";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra = ""): void => {
  (cond ? pass++ : fail++,
    console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`));
};

async function main(): Promise<void> {
  const email = `authtest+${Date.now()}@example.com`;
  const password = "Test-" + Math.random().toString(36).slice(2) + "!9";

  // 1) Crear usuario confirmado via Admin API
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const created = (await createRes.json()) as { id?: string };
  check(
    "Admin API crea usuario confirmado",
    createRes.ok && !!created.id,
    `status=${createRes.status}`,
  );
  if (!created.id) throw new Error("No se pudo crear usuario (revisa service_role key)");

  // 2) Iniciar sesión (password grant) → access_token
  const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = (await signInRes.json()) as { access_token?: string };
  check("Sign-in devuelve access_token (JWT)", signInRes.ok && !!session.access_token);

  // 3) /me con token válido → 200 + claims correctos
  if (session.access_token) {
    const meRes = await fetch(`${API_URL}/me`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    const me = (await meRes.json()) as { userId?: string; email?: string; businessId?: string };
    check("GET /me con token válido → 200", meRes.status === 200, `status=${meRes.status}`);
    check("userId del token = usuario creado", me.userId === created.id);
    check("email del token = email creado", me.email === email);
    console.log(
      `     (businessId en claim = ${me.businessId ?? "undefined"} — se llena con el auth hook E03-T2)`,
    );
  }

  // 4) Limpieza: borrar el usuario de prueba
  const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${created.id}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  });
  check("Limpieza: usuario de prueba borrado", delRes.ok, `status=${delRes.status}`);

  console.log(`\n── ${pass} PASS, ${fail} FAIL ──`);
  if (fail > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
