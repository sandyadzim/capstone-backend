import { describe, expect, it } from 'vitest';
import {
  reportCreateSchema,
  reportAssignSchema,
  reportIdSchema,
  reportListSchema,
  reportRejectSchema,
  reportVerifySchema,
} from './report.schemas.js';

const valid = {
  unitId: '11000000-0000-4000-8000-000000000001',
  title: ' AC rusak ',
  description: ' Tidak dingin ',
  category: 'AC',
  priority: 'MEDIUM',
};

describe('report schemas', () => {
  it('trims text and normalizes UUID casing', () => {
    expect(
      reportCreateSchema.parse({
        ...valid,
        unitId: valid.unitId.toUpperCase(),
      }),
    ).toEqual({
      ...valid,
      unitId: valid.unitId,
      title: 'AC rusak',
      description: 'Tidak dingin',
    });
  });

  it('rejects missing, blank, oversized, invalid, and additional fields', () => {
    expect(
      reportCreateSchema.safeParse({ ...valid, status: 'REPORTED' }).success,
    ).toBe(false);
    expect(
      reportCreateSchema.safeParse({ ...valid, title: '  ' }).success,
    ).toBe(false);
    expect(
      reportCreateSchema.safeParse({ ...valid, title: 'x'.repeat(161) })
        .success,
    ).toBe(false);
    expect(
      reportCreateSchema.safeParse({ ...valid, category: 'OTHERWISE' }).success,
    ).toBe(false);
    expect(
      reportCreateSchema.safeParse({ ...valid, priority: 'URGENT' }).success,
    ).toBe(false);
  });

  it('validates report ids and account-style pagination queries', () => {
    expect(reportIdSchema.safeParse({ id: 'invalid' }).success).toBe(false);
    expect(reportListSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(reportListSchema.parse({ page: '2', pageSize: '100' })).toEqual({
      page: 2,
      pageSize: 100,
    });
    for (const query of [
      { page: '0' },
      { pageSize: '101' },
      { page: '1', unexpected: 'true' },
      { page: ['1', '2'] },
      { page: '9007199254740991', pageSize: '100' },
    ]) {
      expect(reportListSchema.safeParse(query).success).toBe(false);
    }
  });

  it('validates verify and reject decisions with optional internal notes', () => {
    expect(reportVerifySchema.parse({ finalPriority: 'HIGH' })).toEqual({
      finalPriority: 'HIGH',
    });
    expect(
      reportVerifySchema.parse({
        finalPriority: 'LOW',
        reviewNote: '  Reviewed against photos.  ',
      }),
    ).toEqual({
      finalPriority: 'LOW',
      reviewNote: 'Reviewed against photos.',
    });
    expect(
      reportRejectSchema.parse({
        finalPriority: 'MEDIUM',
        rejectionReason: '  Duplicate report. ',
      }),
    ).toEqual({
      finalPriority: 'MEDIUM',
      rejectionReason: 'Duplicate report.',
    });

    for (const input of [
      {},
      { finalPriority: 'URGENT' },
      { finalPriority: 'HIGH', reviewNote: '  ' },
      { finalPriority: 'HIGH', reviewNote: null },
      { finalPriority: 'HIGH', status: 'VERIFIED' },
    ]) {
      expect(reportVerifySchema.safeParse(input).success).toBe(false);
    }
    for (const input of [
      { finalPriority: 'HIGH' },
      { finalPriority: 'HIGH', rejectionReason: '  ' },
      { finalPriority: 'HIGH', rejectionReason: 'Duplicate', reviewerId: 'id' },
    ]) {
      expect(reportRejectSchema.safeParse(input).success).toBe(false);
    }
  });

  it('validates technician assignment input and normalizes optional notes', () => {
    const technicianUserId = '33000000-0000-4000-8000-000000000002';
    expect(
      reportAssignSchema.parse({
        technicianUserId: technicianUserId.toUpperCase(),
        note: '  Please inspect the valve.  ',
      }),
    ).toEqual({
      technicianUserId,
      note: 'Please inspect the valve.',
    });
    expect(reportAssignSchema.parse({ technicianUserId })).toEqual({
      technicianUserId,
    });
    for (const input of [
      {},
      { technicianUserId: 'invalid' },
      { technicianUserId, note: '  ' },
      { technicianUserId, note: null },
      { technicianUserId, status: 'ASSIGNED' },
    ]) {
      expect(reportAssignSchema.safeParse(input).success).toBe(false);
    }
  });
});
