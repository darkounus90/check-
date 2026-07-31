import assert from "node:assert/strict";
import { test } from "node:test";

import { MetricsRegistry } from "@check/shared";

import type { PrismaService } from "../src/database/prisma.service";
import { IngestionService, parseGmailForwardConfirmation } from "../src/ingestion/ingestion.service";
import type { AlertPort } from "../src/observability/alert.port";

/**
 * Onboarding "conexión fácil": la ingesta detecta el correo de confirmación de reenvío de
 * Gmail, guarda el código + enlace en el negocio y auto-confirma abriendo el enlace. NO debe
 * crearse un `bankEmail` ni tratarse como aviso bancario.
 */

const GMAIL_CONFIRM = {
  From: "Gmail Team <forwarding-noreply@google.com>",
  Subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from noreply@nequi.com.co",
  TextBody:
    "tu código de confirmación es 123456789. Para autorizar el reenvío, visita: " +
    "https://mail-settings.google.com/mail/vf-%5Babc%5D-confirm",
  OriginalRecipient: "pagos-abc123@inbound",
};

test("parseGmailForwardConfirmation extrae código y enlace de Google", () => {
  const res = parseGmailForwardConfirmation(GMAIL_CONFIRM.From, `${GMAIL_CONFIRM.Subject}\n${GMAIL_CONFIRM.TextBody}`);
  assert.equal(res?.code, "123456789");
  assert.match(res?.link ?? "", /mail-settings\.google\.com/);
});

test("ignora correos que no vienen de forwarding-noreply@google.com", () => {
  const res = parseGmailForwardConfirmation("noreply@nequi.com.co", "código 123456789 https://x.google.com/y");
  assert.equal(res, null);
});

test("la ingesta guarda el código y auto-confirma, sin crear bankEmail", async () => {
  const updates: Array<Record<string, unknown>> = [];
  let bankEmailCreated = 0;
  const prisma = {
    business: {
      findUnique: async () => ({ id: "biz-1", mailboxStatus: "PENDING", noBankEmail: false }),
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return {};
      },
    },
    bankEmail: {
      create: async () => {
        bankEmailCreated += 1;
        return { id: "be-1" };
      },
    },
    $executeRawUnsafe: async () => 0,
  } as unknown as PrismaService;

  const alerts: AlertPort = { dispatch: async () => undefined };
  const service = new IngestionService(prisma, new MetricsRegistry(), alerts);

  const originalFetch = globalThis.fetch;
  let fetched: string | undefined;
  globalThis.fetch = (async (url: string) => {
    fetched = String(url);
    return { ok: true, status: 200 } as Response;
  }) as typeof fetch;

  try {
    const result = await service.ingest(GMAIL_CONFIRM);
    assert.equal(result.status, "forwarding_confirmed");
    assert.equal(bankEmailCreated, 0, "no debe crear bankEmail");
    assert.match(fetched ?? "", /mail-settings\.google\.com/);
    const saved = updates.find((u) => u.fwdConfirmCode === "123456789");
    assert.ok(saved, "guardó el código de confirmación");
    assert.ok(saved?.fwdConfirmedAt instanceof Date, "marcó fwdConfirmedAt tras auto-confirmar");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
