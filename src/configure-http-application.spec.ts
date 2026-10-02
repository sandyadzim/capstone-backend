import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { configureOpenApi } from './configure-http-application.js';

describe('OpenAPI configuration', () => {
  it('does not mount Swagger in production', () => {
    const setup = vi.spyOn(SwaggerModule, 'setup');

    try {
      configureOpenApi({} as INestApplication, {
        NODE_ENV: 'production',
        PORT: 3001,
        CORS_ORIGINS: ['https://cp.example.com'],
      });

      expect(setup).not.toHaveBeenCalled();
    } finally {
      setup.mockRestore();
    }
  });
});
