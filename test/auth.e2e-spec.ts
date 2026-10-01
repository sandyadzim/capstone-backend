import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { configureHttpApplication } from '../src/configure-http-application.js';
import { getApiEnvironment } from '../src/config/environment.js';
import { DATABASE_CLIENT } from '../src/modules/database/database.module.js';
import { DatabaseService } from '../src/modules/database/database.service.js';
import type { Database } from '../src/modules/database/database.service.js';
import { seedInitialData } from '../src/modules/database/seed-initial-data.js';
import { schema, sessions, users } from '../src/modules/database/schema.js';

const loginIdentifier = 'admin@example.test';
const password = 'test-only-admin-password';
const trustedOrigin = 'http://localhost:5173';
const userAgent = 'cp-be-auth-e2e';

describe('Authentication and sessions (e2e)', () => {
  let client: PGlite;
  let database: PgliteDatabase<typeof schema>;
  let app: INestApplication<App> | undefined;

  async function createApp(): Promise<INestApplication<App>> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_CLIENT)
      .useValue({})
      .overrideProvider(DatabaseService)
      .useValue({ db: database })
      .compile();

    const application = moduleFixture.createNestApplication<App>();
    const config = application.get(ConfigService);
    configureHttpApplication(application, getApiEnvironment(config));
    await application.init();
    return application;
  }

  async function login(): Promise<string> {
    const response = await request(app!.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', trustedOrigin)
      .set('User-Agent', userAgent)
      .send({ loginIdentifier, password })
      .expect(200);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: 'Initial Admin',
      loginIdentifier,
      role: 'ADMIN',
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'id',
      'loginIdentifier',
      'name',
      'role',
    ]);

    const cookieHeaders = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookieHeaders)
      ? cookieHeaders.find((value: string) => value.startsWith('__Host-sid='))
      : undefined;
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toMatch(/; HttpOnly/i);
    expect(cookieHeader).toMatch(/; Secure/i);
    expect(cookieHeader).toMatch(/; SameSite=Lax/i);
    const cookie = cookieHeader!.split(';', 1)[0];
    const token = cookie.slice('__Host-sid='.length);
    const [storedSession] = await database
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        eq(sessions.id, createHash('sha256').update(token).digest('base64url')),
      );
    expect(storedSession).toBeDefined();
    return cookie;
  }

  beforeAll(async () => {
    client = new PGlite();
    database = drizzle(client, { schema });
    await migrate(database, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
    await seedInitialData(
      database as unknown as Database,
      {
        propertyName: 'Test Property',
        propertyAddress: 'Test Address',
        adminName: 'Initial Admin',
        adminLoginIdentifier: loginIdentifier,
        adminPassword: password,
      },
      (rawPassword) =>
        argon2.hash(rawPassword, {
          type: argon2.argon2id,
          memoryCost: 19_456,
          timeCost: 2,
        }),
    );
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
    await client.close();
  });

  it('rejects protected routes without a session and allows explicitly public health', async () => {
    await request(app!.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app!.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('logs in with the seeded Argon2id password and returns the account actor', async () => {
    const cookie = await login();
    const response = await request(app!.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: 'Initial Admin',
      loginIdentifier,
      role: 'ADMIN',
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'id',
      'loginIdentifier',
      'name',
      'role',
    ]);
  });

  it('returns one generic failure for unknown and incorrect credentials', async () => {
    const incorrectPassword = await request(app!.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', trustedOrigin)
      .send({ loginIdentifier, password: 'wrong-password' })
      .expect(401);
    const unknownAccount = await request(app!.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', trustedOrigin)
      .send({ loginIdentifier: 'unknown@example.test', password })
      .expect(401);

    expect(incorrectPassword.body).toEqual(unknownAccount.body);
    expect(incorrectPassword.body.message).toBe(
      'Invalid login identifier or password',
    );
  });

  it('invalidates an existing session when the account is deactivated', async () => {
    const cookie = await login();
    const [admin] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.loginIdentifier, loginIdentifier));
    await database
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, admin.id));

    try {
      await request(app!.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(401);
    } finally {
      await database
        .update(users)
        .set({ isActive: true })
        .where(eq(users.id, admin.id));
    }
  });

  it('does not accept client-supplied account identity or role fields', async () => {
    await request(app!.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', trustedOrigin)
      .send({
        loginIdentifier,
        password,
        id: '00000000-0000-4000-8000-000000000000',
        role: 'RESIDENT',
      })
      .expect(400);
  });

  it('rejects sign-in requests from untrusted origins', async () => {
    await request(app!.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://untrusted.example')
      .send({ loginIdentifier, password })
      .expect(403);
  });

  it('deletes the server session on logout', async () => {
    const cookie = await login();
    await request(app!.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .expect(204);
    await request(app!.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('keeps a session valid across an API module restart', async () => {
    const cookie = await login();
    await app!.close();
    app = await createApp();

    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: 'Initial Admin',
      loginIdentifier,
      role: 'ADMIN',
    });
  });
});
