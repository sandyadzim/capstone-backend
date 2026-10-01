import type { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const rawEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z
    .preprocess(
      (value: unknown) =>
        typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : value,
      z.number().int().min(1).max(65_535),
    )
    .default(3001),
  CORS_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().optional(),
});

export interface ApiEnvironment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  CORS_ORIGINS: string[];
}

export function getApiEnvironment(config: ConfigService): ApiEnvironment {
  return {
    NODE_ENV: config.getOrThrow<ApiEnvironment['NODE_ENV']>('NODE_ENV'),
    PORT: config.getOrThrow<number>('PORT'),
    CORS_ORIGINS: config.getOrThrow<string[]>('CORS_ORIGINS'),
  };
}

export function validateEnvironment(
  config: Record<string, unknown>,
): ApiEnvironment & { DATABASE_URL?: string } {
  const parsed = rawEnvironmentSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      )
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  const { NODE_ENV, CORS_ORIGINS } = parsed.data;
  const databaseUrl = parsed.data.DATABASE_URL?.trim();
  if (databaseUrl) {
    let parsedDatabaseUrl: URL;
    try {
      parsedDatabaseUrl = new URL(databaseUrl);
    } catch {
      throw new Error(
        'Invalid environment configuration: DATABASE_URL must be a valid PostgreSQL URL',
      );
    }

    if (
      !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
      parsedDatabaseUrl.hostname.length === 0
    ) {
      throw new Error(
        'Invalid environment configuration: DATABASE_URL must be a valid PostgreSQL URL',
      );
    }
  }
  const configuredOrigins = CORS_ORIGINS?.split(',').map((origin) =>
    origin.trim(),
  );

  if (configuredOrigins?.some((origin) => origin.length === 0)) {
    throw new Error(
      'Invalid environment configuration: CORS_ORIGINS contains an empty origin',
    );
  }

  const origins =
    configuredOrigins ??
    (NODE_ENV === 'production' ? [] : ['http://localhost:5173']);

  if (NODE_ENV === 'production' && origins.length === 0) {
    throw new Error(
      'Invalid environment configuration: CORS_ORIGINS is required in production',
    );
  }

  const normalizedOrigins = origins.map((origin) => {
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(
        'Invalid environment configuration: CORS_ORIGINS must contain valid origins',
      );
    }

    if (
      !['http:', 'https:'].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== origin ||
      parsedOrigin.username !== '' ||
      parsedOrigin.password !== ''
    ) {
      throw new Error(
        'Invalid environment configuration: CORS_ORIGINS entries must be origin URLs without paths or credentials',
      );
    }

    return parsedOrigin.origin;
  });

  return {
    NODE_ENV: parsed.data.NODE_ENV,
    PORT: parsed.data.PORT,
    CORS_ORIGINS: [...new Set(normalizedOrigins)],
    ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
  };
}
