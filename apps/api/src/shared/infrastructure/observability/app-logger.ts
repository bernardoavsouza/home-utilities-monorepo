import { ConsoleLogger, type LoggerService } from '@nestjs/common';

export function createAppLogger(): LoggerService {
  const isProduction = process.env.NODE_ENV === 'production';
  return new ConsoleLogger({
    json: isProduction,
    colors: !isProduction,
  });
}
