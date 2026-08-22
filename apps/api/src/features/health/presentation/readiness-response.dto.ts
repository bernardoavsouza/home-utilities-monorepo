import { ApiProperty } from '@nestjs/swagger';
import type { ReadinessResponse } from '@packages/contracts';

class ReadinessDependenciesDto {
  @ApiProperty({ enum: ['up', 'down'] })
  database: ReadinessResponse['dependencies']['database'];
}

export class ReadinessResponseDto implements ReadinessResponse {
  @ApiProperty({ enum: ['ready', 'not_ready'] })
  status: ReadinessResponse['status'];

  @ApiProperty({ type: ReadinessDependenciesDto })
  dependencies: ReadinessDependenciesDto;
}
