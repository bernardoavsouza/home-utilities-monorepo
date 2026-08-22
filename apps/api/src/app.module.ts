import { Module } from '@nestjs/common';
import { HealthModule } from '@/features/health/health.module';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';

@Module({
  imports: [PrismaModule, HealthModule],
})
export class AppModule {}
