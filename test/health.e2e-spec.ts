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
    configureHttpApplication(app, getApiEnvironment(config));
    await app.init();
  });

  it('returns a minimal health response under the API prefix', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('allows configured origins with credentials', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200)
      .expect('access-control-allow-origin', 'http://localhost:5173')
      .expect('access-control-allow-credentials', 'true');
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
