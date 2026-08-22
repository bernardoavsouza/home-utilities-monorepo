import type { ReadinessResponse } from '@packages/contracts';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ReadinessService } from '@/features/health/application/readiness.service';
import { ReadinessResponseDto } from '@/features/health/presentation/readiness-response.dto';

@ApiTags('health')
@Controller('health')
export class ReadinessController {
  constructor(private readonly readinessService: ReadinessService) {}

  /**
   * Readiness, unlike liveness, reports dependencies — so it answers `503` while
   * keeping the same body shape, instead of going through the error envelope.
   */
  @Get('ready')
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({ type: ReadinessResponseDto })
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponse> {
    const readiness = await this.readinessService.check();
    res.status(
      readiness.status === 'ready'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return readiness;
  }
}
