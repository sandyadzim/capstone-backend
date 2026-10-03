import {
  accountCreateSchema,
  accountListSchema,
  accountPatchSchema,
} from './account.schemas.js';

describe('account request schemas', () => {
  it('trims account text, defaults new accounts active, and accepts optional placement', () => {
    expect(
      accountCreateSchema.parse({
        name: ' Resident ',
        loginIdentifier: ' User@Example.Test ',
        password: 'a sufficiently long password',
        role: 'RESIDENT',
      }),
    ).toEqual({
      name: 'Resident',
      loginIdentifier: 'user@example.test',
      password: 'a sufficiently long password',
      role: 'RESIDENT',
      isActive: true,
    });
  });

  it('requires a nonempty strict patch and accepts release as null', () => {
    expect(accountPatchSchema.safeParse({}).success).toBe(false);
    expect(accountPatchSchema.safeParse({ password: 'short' }).success).toBe(
      false,
    );
    expect(accountPatchSchema.parse({ unitId: null })).toEqual({
      unitId: null,
    });
    expect(accountPatchSchema.safeParse({ role: 'OWNER' }).success).toBe(false);
    expect(
      accountPatchSchema.safeParse({ role: 'ADMIN', extra: true }).success,
    ).toBe(false);
  });

  it('parses account filtering and bounded pagination strictly', () => {
    expect(
      accountListSchema.parse({ role: 'TECHNICIAN', isActive: 'true' }),
    ).toEqual({
      page: 1,
      pageSize: 20,
      role: 'TECHNICIAN',
      isActive: true,
    });
    expect(accountListSchema.safeParse({ pageSize: '101' }).success).toBe(
      false,
    );
    expect(accountListSchema.safeParse({ isActive: '1' }).success).toBe(false);
    expect(accountListSchema.safeParse({ unexpected: 'true' }).success).toBe(
      false,
    );
  });
});
