import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureHttpApplication } from './../src/configure-http-application.js';
import { getApiEnvironment } from './../src/config/environment.js';
import { DATABASE_CLIENT } from './../src/modules/database/database.module.js';
import { DatabaseService } from './../src/modules/database/database.service.js';

describe('Health endpoint (e2e)', () => {
  let app: INestApplication<App>;
  const frontendOrigins = ['http://localhost:5173', 'http://localhost:5174'];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_CLIENT)
      .useValue({})
      .overrideProvider(DatabaseService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    const config = app.get(ConfigService);
    configureHttpApplication(app, {
      ...getApiEnvironment(config),
      CORS_ORIGINS: frontendOrigins,
    });
    await app.init();
  });

  it('returns a minimal health response under the API prefix', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('documents password setting bounds for account creation and updates', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    for (const [path, method] of [
      ['/api/accounts', 'post'],
      ['/api/accounts/{id}', 'patch'],
    ]) {
      expect(
        response.body.paths[path][method].requestBody.content[
          'application/json'
        ].schema.properties.password,
      ).toMatchObject({ minLength: 4, maxLength: 30 });
    }
  });

  it.each(frontendOrigins)('allows %s with credentials', async (origin) => {
    await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', origin)
      .expect(200)
      .expect('access-control-allow-origin', origin)
      .expect('access-control-allow-credentials', 'true');
  });

  it.each(frontendOrigins)('allows JSON preflight from %s', async (origin) => {
    const response = await request(app.getHttpServer())
      .options('/api/health')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204)
      .expect('access-control-allow-origin', origin)
      .expect('access-control-allow-credentials', 'true');

    expect(response.headers['access-control-allow-methods']).toContain('GET');
    expect(response.headers['access-control-allow-headers']).toBe(
      'content-type',
    );
  });

  it('does not allow unconfigured origins', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://untrusted.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  afterEach(async () => {
    await app?.close();
  });
});
