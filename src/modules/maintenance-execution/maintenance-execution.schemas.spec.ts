import { describe, expect, it } from 'vitest';
import {
  completeWorkSchema,
  costItemsSchema,
  maintenanceResultSchema,
  startWorkSchema,
} from './maintenance-execution.schemas.js';

describe('start work schema', () => {
  it('accepts UTC, offset, and past timestamps and normalizes them to Date', () => {
    expect(
      startWorkSchema.parse({
        estimatedArrivalAt: '2026-10-04T07:30:00Z',
      }).estimatedArrivalAt,
    ).toEqual(new Date('2026-10-04T07:30:00Z'));
    expect(
      startWorkSchema.parse({
        estimatedArrivalAt: '2020-01-01T14:30:00+07:00',
      }).estimatedArrivalAt,
    ).toEqual(new Date('2020-01-01T07:30:00Z'));
  });

  it('rejects missing, malformed, zoneless, and additional values', () => {
    for (const input of [
      {},
      { estimatedArrivalAt: null },
      { estimatedArrivalAt: '' },
      { estimatedArrivalAt: '2026-10-04' },
      { estimatedArrivalAt: '2026-10-04T14:30:00' },
      { estimatedArrivalAt: '2026-02-30T14:30:00Z' },
      { estimatedArrivalAt: 'not-a-date' },
      { estimatedArrivalAt: '2026-10-04T14:30:00Z', status: 'IN_PROGRESS' },
    ]) {
      expect(startWorkSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe('maintenance result and cost schemas', () => {
  it('trims required result text and normalizes empty optional notes', () => {
    expect(
      maintenanceResultSchema.parse({
        inspectionResult: ' Checked ',
        problemFound: ' Leak ',
        repairAction: ' Fixed ',
        additionalNotes: '   ',
      }),
    ).toEqual({
      inspectionResult: 'Checked',
      problemFound: 'Leak',
      repairAction: 'Fixed',
      additionalNotes: null,
    });
  });

  it('validates decimal values against database precision', () => {
    expect(
      costItemsSchema.safeParse({
        items: [
          {
            type: 'SERVICE',
            description: 'Labor',
            quantity: '999999999.999',
            unitPrice: '999999999999.99',
          },
        ],
      }).success,
    ).toBe(true);
    for (const item of [
      { type: 'OTHER', description: 'Labor', quantity: '1', unitPrice: '1' },
      { type: 'SERVICE', description: ' ', quantity: '1', unitPrice: '1' },
      { type: 'SERVICE', description: 'Labor', quantity: '0', unitPrice: '1' },
      { type: 'SERVICE', description: 'Labor', quantity: '-1', unitPrice: '1' },
      { type: 'SERVICE', description: 'Labor', quantity: '1.0000', unitPrice: '1' },
      { type: 'SERVICE', description: 'Labor', quantity: '1000000000', unitPrice: '1' },
      { type: 'SERVICE', description: 'Labor', quantity: '1', unitPrice: '1.001' },
      { type: 'SERVICE', description: 'Labor', quantity: 1, unitPrice: '1' },
    ]) {
      expect(costItemsSchema.safeParse({ items: [item] }).success).toBe(false);
    }
    expect(costItemsSchema.parse({ items: [] }).items).toEqual([]);
    expect(costItemsSchema.safeParse({ items: [], total: '0' }).success).toBe(
      false,
    );
  });

  it('accepts either an omitted completion body or an empty object only', () => {
    expect(completeWorkSchema.parse(undefined)).toEqual({});
    expect(completeWorkSchema.parse({})).toEqual({});
    expect(completeWorkSchema.safeParse({ receiptUrl: 'https://example.test' }).success)
      .toBe(false);
  });
});
