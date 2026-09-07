import { Module } from '@nestjs/common';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';
import { LedgerService } from '@/modules/financial/application/ledger.service';
import { LedgerRepository } from '@/modules/financial/infrastructure/ledger.repository';

@Module({
  imports: [PrismaModule],
  providers: [LedgerRepository, LedgerService],
  exports: [LedgerService, LedgerRepository],
})
export class FinancialModule {}
