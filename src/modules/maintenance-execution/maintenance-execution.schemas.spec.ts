import { describe, expect, it } from 'vitest';
import { startWorkSchema } from './maintenance-execution.schemas.js';

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
