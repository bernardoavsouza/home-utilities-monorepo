import { Module } from '@nestjs/common';
import { HealthService } from '@/features/health/application/health.service';
import { ReadinessService } from '@/features/health/application/readiness.service';
import { HealthController } from '@/features/health/presentation/health.controller';
import { ReadinessController } from '@/features/health/presentation/readiness.controller';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, ReadinessController],
  providers: [HealthService, ReadinessService],
})
export class HealthModule {}
