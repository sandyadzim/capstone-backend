import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorException, type ApiErrorBody } from './api-error.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    if (exception instanceof ApiErrorException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof HttpException) {
      const body = this.fromHttpException(exception);
      if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `HTTP ${body.statusCode} for ${request.method} ${request.path}`,
          exception.stack,
        );
      }
      response.status(body.statusCode).json(body);
      return;
    }

    this.logger.error(
      `Unhandled exception for ${request.method} ${request.path}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    } satisfies ApiErrorBody);
  }

  private fromHttpException(exception: HttpException): ApiErrorBody {
    const statusCode = exception.getStatus();
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return {
          statusCode,
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
        };
      case HttpStatus.UNAUTHORIZED:
        return {
          statusCode,
          code: 'UNAUTHORIZED',
          message: 'Authentication is required or credentials are invalid',
        };
      case HttpStatus.FORBIDDEN:
        return {
          statusCode,
          code: 'FORBIDDEN',
          message: 'Access is forbidden',
        };
      case HttpStatus.NOT_FOUND:
        return {
          statusCode,
          code: 'NOT_FOUND',
          message: 'Resource not found',
        };
      case HttpStatus.CONFLICT:
        return {
          statusCode,
          code: 'CONFLICT',
          message: 'The request conflicts with the current resource state',
        };
      default:
        if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
          return {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
          };
        }
        return {
          statusCode,
          code: 'HTTP_ERROR',
          message: 'Request failed',
        };
    }
  }
}
