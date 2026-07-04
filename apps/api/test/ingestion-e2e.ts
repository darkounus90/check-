/**
 * E2E de ingesta de correos (E04) contra la api local + BD real.
 * Webhook Postmark → enruta por buzón → persiste → parsea → verifica buzón →
 * registra en base global. Casos: parseado, no autorizado, buzón desconocido, no parseado.
 */
import { PrismaClient } from "@prisma/client";

const API = process.env.API_URL ?? "http://localhost:3021";
const SECRET = process.env.POSTMARK_INBOUND_SECRET ?? "dev-inbound-secret";
const DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "inbound.check.local";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra = ""): void => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

const postWebhook = (mailbox: string, body: unknown, token = SECRET) =>
  fetch(`${API}/webhooks/postmark?token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(body as object), OriginalRecipient: `${mailbox}@${DOMAIN}` }),
  });

async function main(): Promise<void> {
  const mailboxId = `pagos-e2e-${Date.now()}`;
  const approval = String(Date.now()).slice(-10);
  const business = await prisma.business.create({
    data: { name: "Ingesta Test", inboundMailboxId: mailboxId },
  });

  try {
    // 1) No autorizado
    const unauth = await postWebhook(mailboxId, { From: "x" }, "mal-token");
    check("E04-T1 webhook sin token válido → 401", unauth.status === 401);

    // 2) Buzón desconocido
    const unknown = await (
      await postWebhook("no-existe-xyz", { From: "bancolombia", TextBody: "x" })
    ).json();
    check(
      "E04-T2 buzón desconocido → unknown_mailbox",
      (unknown as { status: string }).status === "unknown_mailbox",
    );

    // 3) Correo Bancolombia válido → parseado
    const okRes = await (
      await postWebhook(mailboxId, {
        From: "alertasyavisos@bancolombia.com.co",
        Subject: "Recibiste una transferencia",
        TextBody: `Recibiste una transferencia por $150.000,00 en tu cuenta de ahorros *8842.\nComprobante No. ${approval}\nFecha: 2026-07-03 14:22`,
      })
    ).json();
    check("E04 correo válido → status parsed", (okRes as { status: string }).status === "parsed");

    const email = await prisma.bankEmail.findFirst({
      where: { businessId: business.id, status: "PARSED" },
    });
    check("E04-T3/T10 BankEmail PARSED persistido", !!email);
    check(
      "monto en centavos correcto",
      email?.amountCents === 15_000_000,
      `= ${email?.amountCents}`,
    );
    check("approvalNumber correcto", email?.approvalNumber === approval);
    check(
      "banco = BANCOLOMBIA, versión v1",
      email?.bank === "BANCOLOMBIA" && email?.parserVersion === "v1",
    );

    const biz = await prisma.business.findUnique({ where: { id: business.id } });
    check("E03-T8 buzón marcado VERIFIED por 1er correo", biz?.mailboxStatus === "VERIFIED");

    const [exists] = (await prisma.$queryRawUnsafe(
      `select approval_number_exists('bancolombia', $1) as e`,
      approval,
    )) as Array<{ e: boolean }>;
    check("base global: aprobación registrada (D6)", exists?.e === true);

    // 4) Correo no reconocido → unparsed
    const bad = await (
      await postWebhook(mailboxId, { From: "spam@nada.com", TextBody: "hola sin banco" })
    ).json();
    check(
      "E04-T9 correo no reconocido → unparsed",
      (bad as { status: string }).status === "unparsed",
    );
    const unparsedCount = await prisma.bankEmail.count({
      where: { businessId: business.id, status: "UNPARSED" },
    });
    check("BankEmail UNPARSED persistido (no se pierde)", unparsedCount === 1);
  } finally {
    await prisma.bankEmail.deleteMany({ where: { businessId: business.id } });
    await prisma.$executeRawUnsafe(
      `delete from approval_numbers where "approvalNumber" = $1`,
      approval,
    );
    await prisma.business.deleteMany({ where: { id: business.id } });
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
