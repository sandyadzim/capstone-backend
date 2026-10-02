import type { INestApplication } from '@nestjs/common';
import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { performance } from 'node:perf_hooks';
import type { ApiEnvironment } from './config/environment.js';
import { ApiErrorException } from './common/http/api-error.js';

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
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: (issues) =>
        new ApiErrorException({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: {
            issues: issues.map((issue) => ({
              path: (issue.path ?? []).map((segment) => {
                if (
                  typeof segment === 'object' &&
                  segment !== null &&
                  'key' in segment
                ) {
                  return String(segment.key);
                }
                return String(segment);
              }),
              message: issue.message,
            })),
          },
        }),
    }),
  );
  configureOpenApi(app, environment);
  app.use(requestLoggingMiddleware);
}

export function configureOpenApi(
  app: INestApplication,
  environment: ApiEnvironment,
): void {
  if (environment.NODE_ENV === 'production') {
    return;
  }

  const options = new DocumentBuilder()
    .setTitle('CP Backend API')
    .setDescription('REST API for the property maintenance system')
    .setVersion('1.0')
    .addCookieAuth('__Host-sid')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, options);

  SwaggerModule.setup('docs', app, documentFactory, {
    useGlobalPrefix: true,
  });
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
