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
});
