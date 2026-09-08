import { Module } from '@nestjs/common';
import { HealthModule } from '@/features/health/health.module';
import { FinancialModule } from '@/modules/financial/financial.module';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';

@Module({
  imports: [PrismaModule, HealthModule, FinancialModule],
})
export class AppModule {}
