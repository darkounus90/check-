import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/** PrismaClient como provider de Nest (conecta/desconecta con el ciclo de vida del módulo). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
