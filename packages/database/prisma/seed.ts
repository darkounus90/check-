import { PrismaClient, ReceiverBank, Role } from "@prisma/client";

/**
 * Seed de desarrollo (E02-T12): 2 negocios con dueño, cajero y cuentas.
 * Sirve para probar el aislamiento multi-tenant (E02-T13).
 * Ejecutar: `pnpm --filter @check/database db:seed` (requiere DATABASE_URL).
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const negocios = [
    { name: "Panadería La Esquina", mailbox: "biz-esquina", bank: ReceiverBank.BANCOLOMBIA },
    { name: "Ferretería El Tornillo", mailbox: "biz-tornillo", bank: ReceiverBank.DAVIVIENDA },
  ];

  for (const [i, n] of negocios.entries()) {
    const business = await prisma.business.create({
      data: {
        name: n.name,
        inboundMailboxId: n.mailbox,
        receivingAccounts: {
          create: { bank: n.bank, accountNumber: `00012345${i}`, alias: "Principal" },
        },
        memberships: {
          create: [
            {
              role: Role.OWNER,
              user: {
                create: { supabaseUserId: `owner-${n.mailbox}`, email: `owner@${n.mailbox}.test` },
              },
            },
            {
              role: Role.CASHIER,
              user: {
                create: {
                  supabaseUserId: `cashier-${n.mailbox}`,
                  email: `cashier@${n.mailbox}.test`,
                },
              },
            },
          ],
        },
      },
    });
    // eslint-disable-next-line no-console
    console.log(`Negocio creado: ${business.name} (opaqueId=${business.opaqueId})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e: unknown) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
