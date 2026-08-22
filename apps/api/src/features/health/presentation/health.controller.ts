import type { HealthResponse } from '@packages/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from '@/features/health/application/health.service';
import { HealthResponseDto } from '@/features/health/presentation/health-response.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  check(): HealthResponse {
    return this.healthService.getStatus();
  }
}
