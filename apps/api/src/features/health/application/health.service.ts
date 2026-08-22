import type { HealthResponse } from '@packages/contracts';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getStatus(): HealthResponse {
    return { status: 'ok' };
  }
}
