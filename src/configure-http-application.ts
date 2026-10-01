import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { performance } from 'node:perf_hooks';
import type { ApiEnvironment } from './config/environment.js';

export function configureHttpApplication(
  app: INestApplication,
  environment: ApiEnvironment,
): void {
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: environment.CORS_ORIGINS,
    credentials: true,
  });
  app.enableCsrfProtection({ trustedOrigins: environment.CORS_ORIGINS });
  app.use(requestLoggingMiddleware);
}

function requestLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = performance.now();

  response.once('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    Logger.log(
      `${request.method} ${request.path} ${response.statusCode} ${durationMs}ms`,
      'HTTP',
    );
  });

  next();
}
