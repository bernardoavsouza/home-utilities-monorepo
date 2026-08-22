import type { ApiErrorBody } from '@packages/contracts';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from '@/shared/infrastructure/http/request-id.middleware';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const { statusCode, message, error } = this.resolveError(exception);
    const body: ApiErrorBody = {
      statusCode,
      message,
      ...(error !== undefined ? { error } : {}),
    };

    const requestId = request.requestId;
    const method = request.method;
    const path = request.url;
    const messageText = Array.isArray(message) ? message.join(', ') : message;
    const logLine = `${method} ${path} ${statusCode} requestId=${requestId ?? ''} ${messageText}`;

    if (statusCode >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(logLine, stack);
    } else {
      this.logger.warn(logLine);
    }

    response.status(statusCode).json(body);
  }

  private resolveError(exception: unknown): ApiErrorBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        return {
          statusCode,
          message: exceptionResponse,
          error: exception.name,
        };
      }

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const payload = exceptionResponse as Record<string, unknown>;
        const message =
          typeof payload.message === 'string' || Array.isArray(payload.message)
            ? (payload.message as string | string[])
            : exception.message;
        const error =
          typeof payload.error === 'string' ? payload.error : exception.name;

        return { statusCode, message, error };
      }

      return {
        statusCode,
        message: exception.message,
        error: exception.name,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    };
  }
}
