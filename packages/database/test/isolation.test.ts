/**
 * E02-T13 · Test de aislamiento multi-tenant (RLS) contra la BD real.
 *
 * Simula el contexto de Supabase Auth: SET ROLE authenticated + claim `business_id`
 * (como haría un JWT), y verifica fuga cero entre dos tenants + la base global (D6).
 *
 * Ejecutar: DATABASE_URL/DIRECT_URL en .env, luego
 *   pnpm --filter @check/database exec tsx test/isolation.test.ts
 */
import { PrismaClient } from "@prisma/client";

// El Prisma Client conecta por el transaction pooler (DATABASE_URL); SET LOCAL ROLE
// y set_config(...,true) viven dentro de cada transacción interactiva (una conexión).
const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
const prisma = new PrismaClient({ datasourceUrl: url });

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

/** Corre selects como `authenticated` con el claim business_id dado, en una transacción. */
async function countsAsTenant(businessId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `select set_config('request.jwt.claims', json_build_object('business_id', $1::text)::text, true)`,
      businessId,
    );
    await tx.$executeRawUnsafe(`set local role authenticated`);
    const q = async (sql: string): Promise<number> => {
      const rows = (await tx.$queryRawUnsafe(sql)) as Array<{ n: bigint }>;
      return Number(rows[0]?.n ?? 0);
    };
    return {
      businesses: await q(`select count(*)::int as n from businesses`),
      accounts: await q(`select count(*)::int as n from receiving_accounts`),
      memberships: await q(`select count(*)::int as n from memberships`),
      approvalsDirect: await q(`select count(*)::int as n from approval_numbers`),
    };
  });
}

async function main(): Promise<void> {
  // Setup (como postgres): permisos al rol authenticated + registrar un número global para A.
  await prisma.$executeRawUnsafe(`grant usage on schema public to authenticated`);
  await prisma.$executeRawUnsafe(
    `grant select, insert, update, delete on all tables in schema public to authenticated`,
  );

  const businesses = await prisma.business.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  if (businesses.length < 2) throw new Error("Se esperaban >=2 negocios (corre el seed primero).");
  const a = businesses[0]!;
  const b = businesses[1]!;
  console.log(`Negocio A = ${a.name}\nNegocio B = ${b.name}\n`);

  await prisma.$executeRawUnsafe(
    `select approval_number_register('nequi', 'APR-TEST-1', $1)`,
    a.id,
  );

  // Contraste como postgres (BYPASSRLS): ve todo.
  const totalBiz = await prisma.business.count();
  console.log("Como postgres (bypass RLS):");
  check("ve los 2 negocios", totalBiz === 2, `count=${totalBiz}`);

  // Tenant A
  console.log(`\nComo authenticated con claim = A (${a.name}):`);
  const asA = await countsAsTenant(a.id);
  check("solo ve SU negocio", asA.businesses === 1, `businesses=${asA.businesses}`);
  check("solo ve SUS cuentas", asA.accounts === 1, `accounts=${asA.accounts}`);
  check("solo ve SUS miembros", asA.memberships === 2, `memberships=${asA.memberships}`);
  check(
    "NO puede leer approval_numbers directamente (D6)",
    asA.approvalsDirect === 0,
    `directo=${asA.approvalsDirect}`,
  );

  // Tenant B
  console.log(`\nComo authenticated con claim = B (${b.name}):`);
  const asB = await countsAsTenant(b.id);
  check("solo ve SU negocio", asB.businesses === 1, `businesses=${asB.businesses}`);
  check("solo ve SUS cuentas", asB.accounts === 1, `accounts=${asB.accounts}`);
  check("no ve datos de A (aislamiento)", asB.memberships === 2 && asB.accounts === 1);

  // Base global (D6): función de existencia responde sí/no sin exponer el negocio.
  console.log("\nBase global de aprobaciones (D6, función existencia-only):");
  const [exists] = (await prisma.$queryRawUnsafe(
    `select approval_number_exists('nequi','APR-TEST-1') as e`,
  )) as Array<{ e: boolean }>;
  check("existe un número ya usado → true", exists?.e === true);
  const [notExists] = (await prisma.$queryRawUnsafe(
    `select approval_number_exists('nequi','NO-EXISTE-999') as e`,
  )) as Array<{ e: boolean }>;
  check("número nunca visto → false", notExists?.e === false);

  // Violación de with-check: A intenta insertar una cuenta para B → RLS lo bloquea.
  console.log("\nEscritura cruzada (A intenta escribir en B):");
  let blocked = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `select set_config('request.jwt.claims', json_build_object('business_id', $1::text)::text, true)`,
        a.id,
      );
      await tx.$executeRawUnsafe(`set local role authenticated`);
      await tx.$executeRawUnsafe(
        `insert into receiving_accounts (id, "businessId", bank, "accountNumber") values (gen_random_uuid()::text, $1, 'BANCOLOMBIA', '999')`,
        b.id,
      );
    });
  } catch {
    blocked = true;
  }
  check("insert de A con businessId de B es RECHAZADO por RLS", blocked);

  console.log(`\n── Resultado: ${passed} PASS, ${failed} FAIL ──`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (e: unknown) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
