/**
 * E2E de onboarding (E03-T3..T6) contra Supabase + api local.
 * Registro de negocio, alta de cajero, guard de roles (cajero→403), CRUD de cuentas.
 * Limpia todo al final. NO imprime tokens ni keys.
 */
import { PrismaClient } from "@prisma/client";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API = process.env.API_URL ?? "http://localhost:3021";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra = ""): void => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

const admin = (path: string, method = "POST", body?: unknown) =>
  fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

async function makeUser(): Promise<{ id: string; token: string; email: string }> {
  const email = `onb+${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = "Test-" + Math.random().toString(36).slice(2) + "!9";
  const created = (await (
    await admin("/admin/users", "POST", { email, password, email_confirm: true })
  ).json()) as {
    id: string;
  };
  const session = (await (
    await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  ).json()) as { access_token: string };
  return { id: created.id, token: session.access_token, email };
}

const api = (token: string, path: string, method = "GET", body?: unknown) =>
  fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

async function main(): Promise<void> {
  const owner = await makeUser();
  let businessId = "";
  let cashierSupabaseId = "";
  let cashierToken = "";

  try {
    // T4: registrar negocio
    const regRes = await api(owner.token, "/onboarding/register-business", "POST", {
      name: "Café de Prueba",
    });
    const biz = (await regRes.json()) as {
      id: string;
      opaqueId: string;
      inboundMailboxId: string;
      mailboxStatus: string;
    };
    businessId = biz.id;
    check("T4 registrar negocio → 201", regRes.status === 201 && !!biz.id);
    check("negocio tiene opaqueId no adivinable", !!biz.opaqueId && biz.opaqueId !== biz.id);
    check(
      "buzón asignado, mailboxStatus=PENDING",
      !!biz.inboundMailboxId && biz.mailboxStatus === "PENDING",
    );

    // /me del dueño refleja OWNER
    const meOwner = (await (await api(owner.token, "/me")).json()) as { role?: string };
    check("dueño tiene role=OWNER", meOwner.role === "OWNER");

    // T5: alta de cajero
    const cashierEmail = `cashier+${Date.now()}@example.com`;
    const cashierPass = "Cashier-" + Math.random().toString(36).slice(2) + "!9";
    const invRes = await api(owner.token, "/onboarding/cashiers", "POST", {
      email: cashierEmail,
      password: cashierPass,
    });
    check("T5 dueño da de alta cajero → 201", invRes.status === 201);
    // sign-in cajero
    const cashierSession = (await (
      await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: ANON, "content-type": "application/json" },
        body: JSON.stringify({ email: cashierEmail, password: cashierPass }),
      })
    ).json()) as { access_token: string };
    cashierToken = cashierSession.access_token;
    const meCashier = (await (await api(cashierToken, "/me")).json()) as {
      role?: string;
      businessId?: string;
      userId?: string;
    };
    // El userId de /me es el sub del JWT = id de usuario en Supabase.
    cashierSupabaseId = meCashier.userId ?? "";
    check(
      "cajero tiene role=CASHIER en el mismo negocio",
      meCashier.role === "CASHIER" && meCashier.businessId === businessId,
    );

    // T3: guard de roles — cajero NO puede acciones de dueño
    const cashierCreateAcc = await api(cashierToken, "/accounts", "POST", {
      bank: "BANCOLOMBIA",
      accountNumber: "123",
    });
    check("T3 cajero POST /accounts → 403", cashierCreateAcc.status === 403);
    const cashierInvite = await api(cashierToken, "/onboarding/cashiers", "POST", {
      email: "x@y.com",
      password: "12345678",
    });
    check("T3 cajero POST /cashiers → 403", cashierInvite.status === 403);

    // T6: dueño CRUD de cuentas
    const createAcc = await api(owner.token, "/accounts", "POST", {
      bank: "BANCOLOMBIA",
      accountNumber: "0011223344",
      alias: "Principal",
    });
    const acc = (await createAcc.json()) as { id: string };
    check("T6 dueño crea cuenta → 201", createAcc.status === 201 && !!acc.id);

    const badBank = await api(owner.token, "/accounts", "POST", {
      bank: "NEQUI",
      accountNumber: "1",
    });
    check("banco receptor inválido (NEQUI) → 400", badBank.status === 400);

    const listCashier = (await (await api(cashierToken, "/accounts")).json()) as unknown[];
    check(
      "cajero puede LISTAR cuentas (lectura) → ve 1",
      Array.isArray(listCashier) && listCashier.length === 1,
    );

    const delAcc = await api(owner.token, `/accounts/${acc.id}`, "DELETE");
    check("dueño borra cuenta → 200", delAcc.status === 200);

    const cashierDel = await api(cashierToken, `/accounts/${acc.id}`, "DELETE");
    check("cajero DELETE cuenta → 403", cashierDel.status === 403);
  } finally {
    // Limpieza
    if (businessId) {
      await prisma.receivingAccount.deleteMany({ where: { businessId } });
      await prisma.membership.deleteMany({ where: { businessId } });
      const users = await prisma.user.findMany({
        where: { supabaseUserId: { in: [owner.id, cashierSupabaseId].filter(Boolean) } },
      });
      await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
      await prisma.business.deleteMany({ where: { id: businessId } });
    }
    await admin(`/admin/users/${owner.id}`, "DELETE");
    if (cashierSupabaseId) await admin(`/admin/users/${cashierSupabaseId}`, "DELETE");
    await prisma.$disconnect();
  }

  console.log(`\n── ${pass} PASS, ${fail} FAIL ──`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e: unknown) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
