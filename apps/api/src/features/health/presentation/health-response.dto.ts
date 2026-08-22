import { ApiProperty } from '@nestjs/swagger';
import type { HealthResponse } from '@packages/contracts';

export class HealthResponseDto implements HealthResponse {
  @ApiProperty({ enum: ['ok'] })
  status: HealthResponse['status'];
}
