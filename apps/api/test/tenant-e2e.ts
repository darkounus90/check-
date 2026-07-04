/**
 * E2E de E03-T2 (mapeo usuario→negocio + RLS) contra Supabase + api local.
 * Crea usuario Supabase, lo vincula a un negocio existente (users + membership),
 * inicia sesión y verifica que /me resuelve businessId + role desde la BD. Limpia todo.
 * NO imprime tokens ni keys.
 */
import { PrismaClient } from "@prisma/client";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_URL = process.env.API_URL ?? "http://localhost:3021";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra = ""): void => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

async function main(): Promise<void> {
  const email = `tenanttest+${Date.now()}@example.com`;
  const password = "Test-" + Math.random().toString(36).slice(2) + "!9";

  const business = await prisma.business.findFirst({ orderBy: { name: "asc" } });
  if (!business) throw new Error("No hay negocios (corre el seed).");

  // 1) Crear usuario Supabase confirmado
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
  if (!created.id) throw new Error("No se pudo crear usuario Supabase");

  // 2) Vincular en la BD: users + membership (rol OWNER) al negocio
  const dbUser = await prisma.user.create({
    data: {
      supabaseUserId: created.id,
      email,
      memberships: { create: { businessId: business.id, role: "OWNER" } },
    },
  });
  check("usuario vinculado a negocio en la BD", !!dbUser.id, `business=${business.name}`);

  // 3) Sign-in → token
  const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = (await signInRes.json()) as { access_token?: string };
  check("sign-in devuelve token", !!session.access_token);

  // 4) /me resuelve businessId + role desde la BD
  const meRes = await fetch(`${API_URL}/me`, {
    headers: { authorization: `Bearer ${session.access_token}` },
  });
  const me = (await meRes.json()) as { businessId?: string; role?: string; userId?: string };
  check("GET /me → 200", meRes.status === 200);
  check("businessId correcto (desde la BD)", me.businessId === business.id, `= ${me.businessId}`);
  check("role = OWNER", me.role === "OWNER", `= ${me.role}`);

  // 5) Limpieza
  await prisma.membership.deleteMany({ where: { userId: dbUser.id } });
  await prisma.user.delete({ where: { id: dbUser.id } });
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${created.id}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  });
  check("limpieza (BD + usuario Supabase)", true);

  console.log(`\n── ${pass} PASS, ${fail} FAIL ──`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e: unknown) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
