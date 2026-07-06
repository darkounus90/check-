import "reflect-metadata";

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import { Module } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";

import { PrismaService } from "../src/database/prisma.service";
import {
  OCR_ENQUEUER,
  PUBLIC_RATE_LIMITS,
  PUBLIC_THROTTLE_TTL_MS,
  VOUCHER_STORAGE_UPLOADER,
} from "../src/public/public.constants";
import { PublicController } from "../src/public/public.controller";
import { PublicVouchersService } from "../src/public/public-vouchers.service";
import { QrRouterService } from "../src/public/qr-router.service";

/**
 * Tests de rate limiting anti-abuso de los endpoints públicos (E09-T7). Levanta
 * una app Nest real (con el `PublicController` y el `ThrottlerGuard` reales) pero
 * con Prisma/Storage/cola FAKE, así que NO requiere BD, Supabase ni Redis. Verifica
 * que bajo el umbral pasa y que pasado el umbral responde 429 con `Retry-After`.
 *
 * Cada test levanta su PROPIA app para que el contador en memoria del throttler
 * arranque limpio (todas las requests de prueba comparten la IP 127.0.0.1).
 */

const BUSINESS = { id: "biz-1", opaqueId: "opq-throttle", name: "Rate Test" };

const fakePrisma = {
  business: {
    async findUnique({ where }: { where: { opaqueId: string } }) {
      return where.opaqueId === BUSINESS.opaqueId ? { id: BUSINESS.id, name: BUSINESS.name } : null;
    },
  },
  voucher: {
    async create() {
      return { id: "voucher-1" };
    },
    async findUnique() {
      return { ocrStatus: "PENDING", transaction: null };
    },
  },
};

const fakeStorage = { async uploadVoucher() {} };
const fakeQueue = { async enqueueVoucherOcr() {} };

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: PUBLIC_RATE_LIMITS.ingestPerIp.name,
        ttl: PUBLIC_THROTTLE_TTL_MS,
        limit: PUBLIC_RATE_LIMITS.ingestPerIp.limit,
      },
      {
        name: PUBLIC_RATE_LIMITS.ingestPerBusiness.name,
        ttl: PUBLIC_THROTTLE_TTL_MS,
        limit: PUBLIC_RATE_LIMITS.ingestPerBusiness.limit,
        getTracker: (req: Record<string, unknown>) => {
          const params = req.params as { opaqueId?: string } | undefined;
          return params?.opaqueId ? `business:${params.opaqueId}` : (req.ip as string);
        },
      },
      {
        name: PUBLIC_RATE_LIMITS.pollPerIp.name,
        ttl: PUBLIC_THROTTLE_TTL_MS,
        limit: PUBLIC_RATE_LIMITS.pollPerIp.limit,
      },
    ]),
  ],
  controllers: [PublicController],
  providers: [
    PublicVouchersService,
    QrRouterService,
    { provide: PrismaService, useValue: fakePrisma },
    { provide: VOUCHER_STORAGE_UPLOADER, useValue: fakeStorage },
    { provide: OCR_ENQUEUER, useValue: fakeQueue },
  ],
})
class TestPublicModule {}

async function bootApp(): Promise<{ app: INestApplication; baseUrl: string }> {
  const app = await NestFactory.create(TestPublicModule, { logger: false });
  await app.listen(0);
  const server = app.getHttpServer() as { address(): AddressInfo | string | null };
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}

// Multipart mínimo con un JPEG de juguete (campo `file`).
function jpegMultipart(): { body: Buffer; contentType: string } {
  const boundary = "----checkboundary";
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="v.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(head),
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from(tail),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function postVoucher(baseUrl: string): Promise<Response> {
  const { body, contentType } = jpegMultipart();
  return fetch(`${baseUrl}/public/n/${BUSINESS.opaqueId}/vouchers`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

test("ingesta: hasta el umbral por IP (10) pasa 201; el siguiente responde 429 con Retry-After", async () => {
  const { app, baseUrl } = await bootApp();
  try {
    const limit = PUBLIC_RATE_LIMITS.ingestPerIp.limit;

    for (let i = 0; i < limit; i++) {
      const res = await postVoucher(baseUrl);
      assert.equal(res.status, 201, `request ${i + 1} debería pasar`);
      await res.arrayBuffer();
    }

    const blocked = await postVoucher(baseUrl);
    assert.equal(blocked.status, 429);
    // Con throttlers nombrados la cabecera lleva el sufijo del throttler.
    assert.ok(
      blocked.headers.get(`retry-after-${PUBLIC_RATE_LIMITS.ingestPerIp.name}`),
      "429 debe incluir Retry-After del throttler que se excedió",
    );
    await blocked.arrayBuffer();
  } finally {
    await app.close();
  }
});

test("polling: límite generoso por IP (60/min) — un puñado de requests legítimas pasan sin 429", async () => {
  const { app, baseUrl } = await bootApp();
  try {
    for (let i = 0; i < 12; i++) {
      const res = await fetch(`${baseUrl}/public/vouchers/voucher-1`);
      assert.equal(res.status, 200, `poll ${i + 1} debería pasar`);
      await res.arrayBuffer();
    }
  } finally {
    await app.close();
  }
});

test("identificación del negocio (GET /n/:opaqueId): sin rate limit — no se bloquea aunque se repita", async () => {
  const { app, baseUrl } = await bootApp();
  try {
    // Más que cualquier límite de ingesta/poll: si estuviera throttleado, fallaría.
    for (let i = 0; i < 70; i++) {
      const res = await fetch(`${baseUrl}/public/n/${BUSINESS.opaqueId}`);
      assert.equal(res.status, 200, `getBusiness ${i + 1} debería pasar`);
      await res.arrayBuffer();
    }
  } finally {
    await app.close();
  }
});
