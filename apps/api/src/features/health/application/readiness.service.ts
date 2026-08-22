import type { ReadinessResponse } from '@packages/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<ReadinessResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', dependencies: { database: 'up' } };
    } catch (error) {
      this.logger.warn(
        `readiness: database unreachable — ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'not_ready', dependencies: { database: 'down' } };
    }
  }
}
