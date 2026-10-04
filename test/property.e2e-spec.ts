import request from 'supertest';
import { PropertyService } from '../src/modules/property/property.service.js';
import { properties } from '../src/modules/database/schema.js';
import { eq } from 'drizzle-orm';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('Property API (e2e)', () => {
  const ctx = usePropertyUnitsContext();
  it('updates trimmed profile fields, clears logos, and rejects client URLs', async () => {
    const response = await ctx
      .api('patch', '/api/property')
      .send({ name: ' Renamed ', address: ' Address ' })
      .expect(200);
    expect(response.body).toMatchObject({
      id: ctx.ids.INITIAL_PROPERTY_ID,
      name: 'Renamed',
      address: 'Address',
      logoUrl: null,
    });
    expect(response.body.createdAt).toEqual(expect.any(String));
    const property = ctx.app.get(PropertyService);
    await property.updateLogoFromVerifiedUpload(
      ctx.ids.actorIds.ADMIN,
      'https://example.test/verified-logo.png',
    );
    await ctx
      .api('patch', '/api/property')
      .send({ logoUrl: 'https://example.test/untrusted-logo.png' })
      .expect(400);
    expect(
      (await ctx.api('get', '/api/property').expect(200)).body.logoUrl,
    ).toBe('https://example.test/verified-logo.png');
    await ctx.api('patch', '/api/property').send({ logoUrl: null }).expect(200);
    expect((await ctx.api('get', '/api/property')).body.logoUrl).toBeNull();
    await expect(
      property.updateLogoFromVerifiedUpload(
        ctx.ids.actorIds.ADMIN,
        'http://example.test/logo.png',
      ),
    ).rejects.toThrow();
  });

  it('allows every authenticated role to read the profile and restricts changes to Admin', async () => {
    await ctx.api('get', '/api/property', null).expect(401);
    await ctx
      .api('patch', '/api/property', null)
      .send({ name: 'Name' })
      .expect(401);
    for (const role of ['ADMIN', 'TECHNICIAN', 'RESIDENT'] as const) {
      await ctx.api('get', '/api/property', role).expect(200);
    }
    for (const role of ['TECHNICIAN', 'RESIDENT'] as const) {
      await ctx
        .api('patch', '/api/property', role)
        .send({ name: 'Name' })
        .expect(403);
    }
  });

  it('returns 404 when the configured property is absent', async () => {
    await ctx.db
      .delete(properties)
      .where(eq(properties.id, ctx.ids.INITIAL_PROPERTY_ID));
    await ctx.db.insert(properties).values({
      id: ctx.ids.otherPropertyId,
      name: 'Other',
      address: 'Other Address',
    });
    await ctx.api('get', '/api/property').expect(404);
    await ctx.api('patch', '/api/property').send({ name: 'Name' }).expect(404);
  });

  it.each([
    {},
    { name: ' ' },
    { address: '' },
    { name: 'a'.repeat(161) },
    { propertyId: '99000000-0000-4000-8000-000000000001' },
  ])('returns validation issues for invalid profile patch %j', async (body) => {
    const response = await ctx
      .api('patch', '/api/property')
      .send(body)
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: expect.any(Array) },
    });
  });

  it('documents the property routes, response schema, and cookie security', async () => {
    const document = (
      await request(ctx.app.getHttpServer()).get('/api/docs-json').expect(200)
    ).body;
    const read = document.paths['/api/property'].get;
    const update = document.paths['/api/property'].patch;
    expect(read.security).toEqual(document.paths['/api/auth/me'].get.security);
    for (const operation of [read, update]) {
      expect(operation.responses['401']).toBeDefined();
      expect(operation.responses['403']).toBeDefined();
      expect(operation.responses['404']).toBeDefined();
      expect(operation.responses['500']).toBeDefined();
    }
    expect(read.responses['200']).toBeDefined();
    expect(update.responses['200']).toBeDefined();
    expect(JSON.stringify(update.requestBody)).toContain('logoUrl');
  });
});
