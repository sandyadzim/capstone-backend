import { eq } from 'drizzle-orm';
import { properties, units } from '../src/modules/database/schema.js';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('Resident current unit API (e2e)', () => {
  const ctx = usePropertyUnitsContext();

  it('returns only safe fields for the signed-in Resident’s current unit', async () => {
    const unit = await ctx.createUnit('A-204', {
      floor: 2,
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    await ctx.createUnit('B-101', {
      activeResidentUserId: ctx.ids.secondResidentId,
    });
    const response = await ctx
      .api('get', '/api/resident/unit', 'RESIDENT')
      .expect(200);
    expect(response.body).toEqual({
      unit: { id: unit.id, unitNumber: 'A-204', floor: 2 },
    });
  });

  it('returns an explicit unassigned result', async () => {
    await ctx.createUnit('Other resident', {
      activeResidentUserId: ctx.ids.secondResidentId,
    });
    const response = await ctx
      .api('get', '/api/resident/unit', 'RESIDENT')
      .expect(200);
    expect(response.body).toEqual({ unit: null });
  });

  it('reflects placement, moves and release without changing the session', async () => {
    const first = await ctx.createUnit('A-01');
    const second = await ctx.createUnit('B-01');
    for (const unit of [first, second]) {
      await ctx
        .api('put', `/api/units/${unit.id}/resident`)
        .send({ residentUserId: ctx.ids.actorIds.RESIDENT })
        .expect(200);
      const response = await ctx
        .api('get', '/api/resident/unit', 'RESIDENT')
        .expect(200);
      expect(response.body.unit.id).toBe(unit.id);
    }
    await ctx.api('delete', `/api/units/${second.id}/resident`).expect(200);
    const response = await ctx
      .api('get', '/api/resident/unit', 'RESIDENT')
      .expect(200);
    expect(response.body).toEqual({ unit: null });
  });

  it('does not expose archived or other-property placements', async () => {
    const unit = await ctx.createUnit('Archived', {
      isArchived: true,
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    expect(
      (await ctx.api('get', '/api/resident/unit', 'RESIDENT').expect(200)).body,
    ).toEqual({ unit: null });
    await ctx.db.delete(units).where(eq(units.id, unit.id));
    await ctx.db.insert(properties).values({
      id: ctx.ids.otherPropertyId,
      name: 'Other property',
      address: 'Other address',
    });
    await ctx.createUnit('Foreign', {
      propertyId: ctx.ids.otherPropertyId,
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    expect(
      (await ctx.api('get', '/api/resident/unit', 'RESIDENT').expect(200)).body,
    ).toEqual({ unit: null });
  });

  it('requires a Resident session and rejects caller-supplied selectors', async () => {
    await ctx.api('get', '/api/resident/unit', null).expect(401);
    for (const role of ['ADMIN', 'TECHNICIAN'] as const) {
      await ctx.api('get', '/api/resident/unit', role).expect(403);
    }
    for (const query of [
      'unitId=anything',
      `residentUserId=${ctx.ids.secondResidentId}`,
      'page=1',
    ]) {
      await ctx
        .api('get', `/api/resident/unit?${query}`, 'RESIDENT')
        .expect(400);
    }
    await ctx.api('get', '/api/units', 'RESIDENT').expect(403);
  });

  it('keeps missing property configuration distinct from an unassigned unit', async () => {
    await ctx.db
      .delete(properties)
      .where(eq(properties.id, ctx.ids.INITIAL_PROPERTY_ID));
    await ctx.api('get', '/api/resident/unit', 'RESIDENT').expect(404);
  });

  it('documents the nullable safe response and cookie authentication', async () => {
    const response = await ctx.api('get', '/api/docs-json', null).expect(200);
    const document = response.body;
    expect(document.paths['/api/resident/unit'].get).toMatchObject({
      security: [{ cookie: [] }],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResidentUnitResponseDto' },
            },
          },
        },
      },
    });
    expect(document.components.schemas.ResidentUnitResponseDto).toMatchObject({
      required: ['unit'],
      properties: { unit: { nullable: true } },
    });
    expect(
      Object.keys(
        document.components.schemas.ResidentUnitDetailsDto.properties,
      ).sort(),
    ).toEqual(['floor', 'id', 'unitNumber']);
  });
});
