/**
 * E2E de buzón/onboarding final (E03-T7..T9) contra Supabase + api local.
 * Guía de reenvío, verificación de buzón al llegar el primer correo (simulado),
 * y gate "sin buzón verificado, nunca 🟢". Limpia todo. No imprime secretos.
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

async function makeUser(): Promise<{ id: string; token: string }> {
  const email = `mbx+${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
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
  return { id: created.id, token: session.access_token };
}

const api = (token: string, path: string, method = "GET") =>
  fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}` } });

async function main(): Promise<void> {
  const owner = await makeUser();
  let businessId = "";
  try {
    const biz = (await (
      await fetch(`${API}/onboarding/register-business`, {
        method: "POST",
        headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "Buzón Test" }),
      })
    ).json()) as { id: string };
    businessId = biz.id;

    // T7: guía de buzón
    const st1 = (await (await api(owner.token, "/onboarding/mailbox")).json()) as {
      address: string;
      mailboxStatus: string;
      canEmitGreen: boolean;
      instructions: unknown[];
    };
    check("T7 dirección de buzón presente", !!st1.address && st1.address.includes("@"));
    check("T7 instrucciones para 3 bancos receptores", st1.instructions.length === 3);
    check("estado inicial PENDING", st1.mailboxStatus === "PENDING");
    check("T9 gate: canEmitGreen=false sin verificar", st1.canEmitGreen === false);

    // refresh sin correo → sigue PENDING
    const st2 = (await (await api(owner.token, "/onboarding/mailbox/refresh", "POST")).json()) as {
      mailboxStatus: string;
    };
    check("refresh sin correo → sigue PENDING", st2.mailboxStatus === "PENDING");

    // Simular primer correo entrante (lo haría Épica 4)
    await prisma.bankEmail.create({
      data: { businessId, rawContent: "correo de prueba", status: "UNPARSED" },
    });

    // T8: refresh ahora marca VERIFIED
    const st3 = (await (await api(owner.token, "/onboarding/mailbox/refresh", "POST")).json()) as {
      mailboxStatus: string;
      canEmitGreen: boolean;
    };
    check("T8 refresh con correo → VERIFIED", st3.mailboxStatus === "VERIFIED");
    check("T9 gate: canEmitGreen=true tras verificar", st3.canEmitGreen === true);
  } finally {
    if (businessId) {
      await prisma.bankEmail.deleteMany({ where: { businessId } });
      await prisma.membership.deleteMany({ where: { businessId } });
      const u = await prisma.user.findFirst({ where: { supabaseUserId: owner.id } });
      if (u) await prisma.user.delete({ where: { id: u.id } });
      await prisma.business.deleteMany({ where: { id: businessId } });
    }
    await admin(`/admin/users/${owner.id}`, "DELETE");
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
