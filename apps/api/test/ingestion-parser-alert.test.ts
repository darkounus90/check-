import assert from "node:assert/strict";
import { test } from "node:test";

import { type AlertEvent, MetricsRegistry } from "@check/shared";

import type { PrismaService } from "../src/database/prisma.service";
import { IngestionService } from "../src/ingestion/ingestion.service";
import type { AlertPort } from "../src/observability/alert.port";

/**
 * E11-T4/T7: la ingesta de correos registra la tasa de parseo por banco y, cuando una tanda
 * cae mayormente en "no reconocido", dispara la alerta de parser. Fake Prisma: negocio
 * conocido + create/update no-op.
 */

function makeFakePrisma(): PrismaService {
  return {
    business: {
      findUnique: async () => ({ id: "biz-1", mailboxStatus: "VERIFIED" }),
      update: async () => ({}),
    },
    bankEmail: { create: async () => ({ id: "be-1" }) },
    $executeRawUnsafe: async () => 0,
  } as unknown as PrismaService;
}

function setup() {
  const metrics = new MetricsRegistry();
  const dispatched: AlertEvent[] = [];
  const alerts: AlertPort = { dispatch: async (e) => void dispatched.push(e) };
  const service = new IngestionService(makeFakePrisma(), metrics, alerts);
  return { service, metrics, dispatched };
}

const unparsedEmail = { OriginalRecipient: "mbx@inbound", Subject: "spam", TextBody: "nada bancario" };

test("una tanda de correos no reconocidos dispara alerta de parser", async () => {
  const { service, dispatched } = setup();
  // Ventana por defecto = 20 correos no reconocidos → 100% fallo.
  for (let i = 0; i < 20; i++) await service.ingest(unparsedEmail);

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.kind, "parser_match_failure");
  assert.equal(dispatched[0]?.context?.source, "bank_email");
});

test("registra la métrica de parseo por banco (desconocido en no reconocidos)", async () => {
  const { service, metrics } = setup();
  await service.ingest(unparsedEmail);
  const rates = metrics.snapshot().rates.bank_email_parse;
  assert.equal(rates?.desconocido?.failed, 1);
});
