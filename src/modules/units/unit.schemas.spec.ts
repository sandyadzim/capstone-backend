import {
  unitCreateSchema,
  unitListSchema,
  unitPatchSchema,
} from './unit.schemas.js';
import { rethrowUnitsError } from './units.errors.js';
import { ApiErrorException } from '../../common/http/api-error.js';

describe('Unit contracts', () => {
  it('applies list defaults and transforms exact query values', () => {
    expect(unitListSchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      isArchived: false,
    });
    expect(
      unitListSchema.parse({ page: '2', pageSize: '100', isArchived: 'true' }),
    ).toEqual({ page: 2, pageSize: 100, isArchived: true });
  });
  it.each([
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: '1e2' },
    { page: '9007199254740992' },
    { page: '9007199254740991', pageSize: '100' },
    { pageSize: '101' },
    { pageSize: '0' },
    { isArchived: 'TRUE' },
    { isArchived: '' },
    { page: ['1', '2'] },
    { search: 'abc' },
    { q: 'a'.repeat(41) },
    { q: ['A', 'B'] },
    { q: 1 },
    { displayStatus: '' },
    { displayStatus: 'occupied' },
    { displayStatus: ['OCCUPIED', 'VACANT'] },
  ])('rejects invalid query %j', (input) => {
    expect(unitListSchema.safeParse(input).success).toBe(false);
  });
  it('normalizes optional unit-number search', () => {
    expect(unitListSchema.parse({ q: ' A-01 ' }).q).toBe('A-01');
    expect(unitListSchema.parse({ q: '   ' }).q).toBeUndefined();
    expect(unitListSchema.parse({ q: 'a'.repeat(40) }).q).toHaveLength(40);
  });
  it('accepts optional computed display status', () => {
    for (const displayStatus of ['VACANT', 'OCCUPIED', 'MAINTENANCE'])
      expect(unitListSchema.parse({ displayStatus }).displayStatus).toBe(
        displayStatus,
      );
    expect(unitListSchema.parse({}).displayStatus).toBeUndefined();
  });
  it('trims unit numbers and rejects invalid or empty patches', () => {
    expect(
      unitCreateSchema.parse({ unitNumber: ' A-1 ', floor: -32768 }),
    ).toEqual({ unitNumber: 'A-1', floor: -32768 });
    for (const input of [
      {},
      { floor: 32768 },
      { floor: 1.2 },
      { unitNumber: ' ' },
      { isArchived: true },
    ]) {
      expect(unitPatchSchema.safeParse(input).success).toBe(false);
    }
  });
  it.each(['constraint', 'constraint_name'])(
    'maps only known duplicate constraints (%s)',
    (field) => {
      expect(() =>
        rethrowUnitsError({
          cause: { code: '23505', [field]: 'uk_units_property_number' },
        }),
      ).toThrow(ApiErrorException);
      expect(() =>
        rethrowUnitsError({
          cause: { code: '23505', [field]: 'uk_units_active_resident' },
        }),
      ).toThrow(ApiErrorException);
      const unexpected = new Error('unexpected database failure');
      expect(() => rethrowUnitsError(unexpected)).toThrow(unexpected);
      const unrelated = { code: '23505', [field]: 'another_constraint' };
      try {
        rethrowUnitsError(unrelated);
      } catch (error) {
        expect(error).toBe(unrelated);
      }
    },
  );
});
