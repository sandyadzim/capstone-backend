import { createHash } from 'node:crypto';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import {
  assignments,
  damageReports,
  sessions,
  users,
} from '../src/modules/database/schema.js';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('Accounts API (e2e)', () => {
  const ctx = usePropertyUnitsContext();
  let sequence = 0;

  function uniqueLogin(label: string) {
    sequence += 1;
    return `${label}-${sequence}@example.test`;
  }

  it('creates accounts with normalized identifiers and only stores password hashes', async () => {
    const loginIdentifier = uniqueLogin('new-resident');
    const response = await ctx
      .api('post', '/api/accounts')
      .send({
        name: ' New Resident ',
        loginIdentifier: ` ${loginIdentifier.toUpperCase()} `,
        password: 'test-only-new-password',
        role: 'RESIDENT',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      name: 'New Resident',
      loginIdentifier,
      role: 'RESIDENT',
      isActive: true,
      activeUnit: null,
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'activeUnit',
      'createdAt',
      'id',
      'isActive',
      'loginIdentifier',
      'name',
      'role',
      'updatedAt',
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/password|credential/i);
    const [stored] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, response.body.id));
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toBe('test-only-new-password');

    await ctx
      .api('post', '/api/accounts')
      .send({
        name: 'Duplicate',
        loginIdentifier: loginIdentifier.toUpperCase(),
        password: 'test-only-new-password',
        role: 'ADMIN',
      })
      .expect(409);
  });

  it('lists all accounts by default and filters active Technicians with safe pagination', async () => {
    const active = await ctx
      .api('post', '/api/accounts')
      .send({
        name: 'Technician A',
        loginIdentifier: uniqueLogin('tech-active'),
        password: 'test-only-new-password',
        role: 'TECHNICIAN',
      })
      .expect(201);
    await ctx
      .api('post', '/api/accounts')
      .send({
        name: 'Technician B',
        loginIdentifier: uniqueLogin('tech-inactive'),
        password: 'test-only-new-password',
        role: 'TECHNICIAN',
        isActive: false,
      })
      .expect(201);

    const response = await ctx
      .api(
        'get',
        '/api/accounts?role=TECHNICIAN&isActive=true&page=1&pageSize=1',
      )
      .expect(200);
    expect(response.body.meta).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    const secondPage = await ctx
      .api(
        'get',
        '/api/accounts?role=TECHNICIAN&isActive=true&page=2&pageSize=1',
      )
      .expect(200);
    expect(
      [...response.body.data, ...secondPage.body.data].some(
        (account: { id: string }) => account.id === active.body.id,
      ),
    ).toBe(true);
    expect(
      (await ctx.api('get', '/api/accounts?role=TECHNICIAN')).body.meta.total,
    ).toBe(3);
    expect(
      (await ctx.api('get', '/api/accounts')).body.meta.total,
    ).toBeGreaterThan(5);
    for (const query of [
      'role=OWNER',
      'isActive=1',
      'page=0',
      'pageSize=101',
      'extra=true',
      'page=1&page=2',
    ]) {
      await ctx.api('get', `/api/accounts?${query}`).expect(400);
    }
  });

  it('creates, moves, releases, and cleans up resident placement atomically', async () => {
    const first = await ctx.createUnit('Account-A');
    const second = await ctx.createUnit('Account-B');
    const created = await ctx
      .api('post', '/api/accounts')
      .send({
        name: 'Placed Resident',
        loginIdentifier: uniqueLogin('placed'),
        password: 'test-only-new-password',
        role: 'RESIDENT',
        unitId: first.id,
      })
      .expect(201);
    expect(created.body.activeUnit).toEqual({
      id: first.id,
      unitNumber: 'Account-A',
      floor: 1,
    });
    await ctx
      .api('patch', `/api/accounts/${created.body.id}`)
      .send({ unitId: second.id })
      .expect(200)
      .expect((res) => expect(res.body.activeUnit.id).toBe(second.id));
    expect(
      (await ctx.api('get', `/api/units/${first.id}`)).body.activeResident,
    ).toBeNull();

    const third = await ctx.createUnit('Account-C');
    const secondResident = await ctx
      .api('post', '/api/accounts')
      .send({
        name: 'Deactivated Resident',
        loginIdentifier: uniqueLogin('deactivated-resident'),
        password: 'test-only-new-password',
        role: 'RESIDENT',
        unitId: third.id,
      })
      .expect(201);
    await ctx
      .api('post', `/api/accounts/${secondResident.body.id}/deactivate`)
      .expect(200)
      .expect((res) => {
        expect(res.body.isActive).toBe(false);
        expect(res.body.activeUnit).toBeNull();
      });
    expect(
      (await ctx.api('get', `/api/units/${third.id}`)).body.activeResident,
    ).toBeNull();

    await ctx
      .api('patch', `/api/accounts/${created.body.id}`)
      .send({ unitId: null })
      .expect(200)
      .expect((res) => expect(res.body.activeUnit).toBeNull());
    await ctx
      .api('patch', `/api/accounts/${created.body.id}`)
      .send({ unitId: first.id })
      .expect(200);
    await ctx
      .api('patch', `/api/accounts/${created.body.id}`)
      .send({ role: 'TECHNICIAN' })
      .expect(200)
      .expect((res) => expect(res.body.activeUnit).toBeNull());
    expect(
      (await ctx.api('get', `/api/units/${first.id}`)).body.activeResident,
    ).toBeNull();
  });

  it('rolls back account creation when requested placement conflicts', async () => {
    const occupied = await ctx.createUnit('Occupied', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const loginIdentifier = uniqueLogin('rollback');
    await ctx
      .api('post', '/api/accounts')
      .send({
        name: 'Rollback Resident',
        loginIdentifier,
        password: 'test-only-new-password',
        role: 'RESIDENT',
        unitId: occupied.id,
      })
      .expect(409);
    expect(
      await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.loginIdentifier, loginIdentifier)),
    ).toEqual([]);
  });

  it('changes password and deactivation revoke all stored sessions', async () => {
    const occupied = await ctx.createUnit('Session-occupied', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const created = await ctx
      .api('post', '/api/accounts')
      .send({
        name: 'Session Resident',
        loginIdentifier: uniqueLogin('session'),
        password: 'test-only-old-password',
        role: 'RESIDENT',
      })
      .expect(201);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({
        loginIdentifier: created.body.loginIdentifier,
        password: 'test-only-old-password',
      })
      .expect(200);
    const oldCookie = login.headers['set-cookie'][0].split(';', 1)[0];
    const sessionId = createHash('sha256')
      .update(oldCookie.slice('__Host-sid='.length))
      .digest('base64url');

    await ctx
      .api('patch', `/api/accounts/${created.body.id}`)
      .send({ password: 'test-only-new-password', unitId: occupied.id })
      .expect(409);
    await request(ctx.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', oldCookie)
      .expect(200);
    expect(
      await ctx.db.select().from(sessions).where(eq(sessions.id, sessionId)),
    ).toHaveLength(1);

    await ctx
      .api('patch', `/api/accounts/${created.body.id}`)
      .send({ password: 'test-only-new-password' })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', oldCookie)
      .expect(401);
    expect(
      await ctx.db.select().from(sessions).where(eq(sessions.id, sessionId)),
    ).toEqual([]);
    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({
        loginIdentifier: created.body.loginIdentifier,
        password: 'test-only-new-password',
      })
      .expect(200);

    const newLogin = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({
        loginIdentifier: created.body.loginIdentifier,
        password: 'test-only-new-password',
      })
      .expect(200);
    const newCookie = newLogin.headers['set-cookie'][0].split(';', 1)[0];
    await ctx
      .api('post', `/api/accounts/${created.body.id}/deactivate`)
      .expect(200);
    await request(ctx.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', newCookie)
      .expect(401);
  });

  it('prevents an Admin from removing their own access and deactivates other accounts idempotently', async () => {
    await ctx
      .api('patch', `/api/accounts/${ctx.ids.actorIds.ADMIN}`)
      .send({ role: 'TECHNICIAN' })
      .expect(403);
    await ctx
      .api('post', `/api/accounts/${ctx.ids.actorIds.ADMIN}/deactivate`)
      .expect(403);

    const target = await ctx
      .api('post', '/api/accounts')
      .send({
        name: 'Second Admin',
        loginIdentifier: uniqueLogin('admin'),
        password: 'test-only-new-password',
        role: 'ADMIN',
      })
      .expect(201);
    await ctx
      .api('post', `/api/accounts/${target.body.id}/deactivate`)
      .expect(200);
    await ctx
      .api('post', `/api/accounts/${target.body.id}/deactivate`)
      .expect(200);
    expect(
      (await ctx.api('get', `/api/accounts/${target.body.id}`)).body.isActive,
    ).toBe(false);
  });

  it('blocks disabling a Technician with pending work and preserves history after completion', async () => {
    const technician = await ctx
      .api('post', '/api/accounts')
      .send({
        name: 'Assigned Technician',
        loginIdentifier: uniqueLogin('assigned-tech'),
        password: 'test-only-new-password',
        role: 'TECHNICIAN',
      })
      .expect(201);
    const unit = await ctx.createUnit('Technician-work');
    const report = await ctx.addReport(unit.id, 'ASSIGNED');
    await ctx.db.insert(assignments).values({
      reportId: report.id,
      technicianUserId: technician.body.id,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
    });

    await ctx
      .api('post', `/api/accounts/${technician.body.id}/deactivate`)
      .expect(409);
    expect(
      (await ctx.api('get', `/api/accounts/${technician.body.id}`)).body
        .isActive,
    ).toBe(true);
    await ctx.db
      .update(damageReports)
      .set({
        status: 'CLOSED',
        closedAt: new Date(),
        closedByUserId: ctx.ids.actorIds.ADMIN,
      })
      .where(eq(damageReports.id, report.id));
    await ctx
      .api('post', `/api/accounts/${technician.body.id}/deactivate`)
      .expect(200);
    expect(
      await ctx.db
        .select({ id: assignments.id })
        .from(assignments)
        .where(eq(assignments.technicianUserId, technician.body.id)),
    ).toHaveLength(1);
  });

  it('requires an Admin session for account operations', async () => {
    const calls = [
      ['get', '/api/accounts'],
      ['post', '/api/accounts'],
      ['get', `/api/accounts/${ctx.ids.actorIds.ADMIN}`],
      ['patch', `/api/accounts/${ctx.ids.actorIds.ADMIN}`],
      ['post', `/api/accounts/${ctx.ids.actorIds.ADMIN}/deactivate`],
    ] as const;
    for (const [method, path] of calls) {
      await ctx.api(method, path, null).expect(401);
      for (const role of ['TECHNICIAN', 'RESIDENT'] as const) {
        await ctx.api(method, path, role).expect(403);
      }
    }
  });

  it('documents account routes and account payloads in OpenAPI', async () => {
    const document = (
      await request(ctx.app.getHttpServer()).get('/api/docs-json').expect(200)
    ).body;
    for (const path of [
      '/api/accounts',
      '/api/accounts/{id}',
      '/api/accounts/{id}/deactivate',
    ]) {
      for (const operation of Object.values(document.paths[path]) as {
        security: unknown;
        responses: Record<string, unknown>;
      }[]) {
        expect(operation.security).toEqual(
          document.paths['/api/auth/me'].get.security,
        );
        expect(operation.responses['401']).toBeDefined();
        expect(operation.responses['403']).toBeDefined();
        expect(operation.responses['500']).toBeDefined();
      }
    }
    const create = document.paths['/api/accounts'].post;
    expect(create.responses['201']).toBeDefined();
    expect(JSON.stringify(create.requestBody)).toContain('loginIdentifier');
    expect(JSON.stringify(create.requestBody)).toContain('unitId');
    expect(
      document.paths['/api/accounts'].get.parameters
        .map((parameter: { name: string }) => parameter.name)
        .sort(),
    ).toEqual(['isActive', 'page', 'pageSize', 'role']);
    expect(
      document.components.schemas.AccountResponseDto.properties,
    ).not.toHaveProperty('passwordHash');
  });
});
