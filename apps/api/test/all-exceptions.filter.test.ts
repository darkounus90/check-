import assert from "node:assert/strict";
import { test } from "node:test";

import { type AlertEvent, createMemorySink, StructuredLogger } from "@check/shared";
import type { ArgumentsHost } from "@nestjs/common";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";

import type { AlertPort } from "../src/observability/alert.port";
import { AllExceptionsFilter } from "../src/observability/all-exceptions.filter";

/**
 * E11-T6: toda excepción se registra; las 5xx (no controladas) ADEMÁS se alertan al canal;
 * las 4xx (cliente) no alertan. El body de respuesta mantiene el shape de Nest.
 */

function makeHost(): { host: ArgumentsHost; sent: { status?: number; body?: unknown } } {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return {
        json(body: unknown) {
          sent.body = body;
          return undefined;
        },
      };
    },
  };
  const request = { url: "/x", method: "POST" };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

function setup() {
  const { sink, records } = createMemorySink();
  const dispatched: AlertEvent[] = [];
  const alerts: AlertPort = { dispatch: async (e) => void dispatched.push(e) };
  const filter = new AllExceptionsFilter(new StructuredLogger({ sink }), alerts);
  return { filter, dispatched, records };
}

test("error 500 no controlado → log de error + alerta crítica", () => {
  const { filter, dispatched, records } = setup();
  const { host, sent } = makeHost();

  filter.catch(new Error("boom inesperado"), host);

  assert.equal(sent.status, 500);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.kind, "unhandled_error");
  assert.ok(records.some((r) => r.level === "error"));
});

test("HttpException 400 → sin alerta, warn, body de Nest", () => {
  const { filter, dispatched, records } = setup();
  const { host, sent } = makeHost();

  filter.catch(new BadRequestException("falta campo"), host);

  assert.equal(sent.status, 400);
  assert.equal(dispatched.length, 0);
  assert.ok(records.some((r) => r.level === "warn"));
});

test("InternalServerErrorException (5xx) → alerta", () => {
  const { filter, dispatched } = setup();
  const { host, sent } = makeHost();

  filter.catch(new InternalServerErrorException("db down"), host);
  assert.equal(sent.status, 500);
  assert.equal(dispatched.length, 1);
});
