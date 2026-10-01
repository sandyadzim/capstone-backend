import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('provides safe development defaults', () => {
    expect(validateEnvironment({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      CORS_ORIGINS: ['http://localhost:5173'],
    });
  });

  it('parses the port and configured CORS origins', () => {
    expect(
      validateEnvironment({
        PORT: '4000',
        CORS_ORIGINS: 'https://frontend.example, http://localhost:5173',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      CORS_ORIGINS: ['https://frontend.example', 'http://localhost:5173'],
    });
  });

  it('requires explicit CORS origins in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'CORS_ORIGINS is required in production',
    );
  });

  it('rejects invalid ports and non-origin CORS URLs', () => {
    expect(() => validateEnvironment({ PORT: '70000' })).toThrow(
      'Invalid environment configuration',
    );
    expect(() =>
      validateEnvironment({ CORS_ORIGINS: 'https://frontend.example/app' }),
    ).toThrow('CORS_ORIGINS entries must be origin URLs');
  });

  it('accepts PostgreSQL connection URLs and rejects other protocols', () => {
    expect(
      validateEnvironment({ DATABASE_URL: 'postgresql://localhost:5432/cp' }),
    ).toMatchObject({
      PORT: 3001,
      DATABASE_URL: 'postgresql://localhost:5432/cp',
    });
    expect(() =>
      validateEnvironment({ DATABASE_URL: 'https://db.example' }),
    ).toThrow('DATABASE_URL must be a valid PostgreSQL URL');
  });
});
