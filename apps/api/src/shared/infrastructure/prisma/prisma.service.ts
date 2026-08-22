import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * No `$connect()` on init, by decision: PrismaClient connects lazily on the first
 * query, so a Postgres outage cannot stop the API from booting and answering
 * liveness. Database availability is reported by readiness instead.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
