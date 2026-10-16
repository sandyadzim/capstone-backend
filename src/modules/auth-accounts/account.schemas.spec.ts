import {
  accountCreateSchema,
  accountListSchema,
  accountPatchSchema,
} from './account.schemas.js';

describe('account request schemas', () => {
  it('parses strict optional unassigned filtering without changing defaults', () => {
    expect(
      accountListSchema.parse({ unassignedOnly: 'true' }).unassignedOnly,
    ).toBe(true);
    expect(
      accountListSchema.parse({ unassignedOnly: 'false' }).unassignedOnly,
    ).toBe(false);
    expect(accountListSchema.parse({}).unassignedOnly).toBeUndefined();
    for (const value of [true, 'TRUE', '1', ['true']])
      expect(
        accountListSchema.safeParse({ unassignedOnly: value }).success,
      ).toBe(false);
  });
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

  it.each([4, 30])(
    'accepts a %i-character password unchanged for creation and updates',
    (length) => {
      const password = ` ${'p'.repeat(length - 2)} `;
      expect(
        accountCreateSchema.parse({
          name: 'Resident',
          loginIdentifier: 'resident',
          password,
          role: 'RESIDENT',
        }).password,
      ).toBe(password);
      expect(accountPatchSchema.parse({ password }).password).toBe(password);
    },
  );

  it.each([3, 31])(
    'rejects a %i-character password for creation and updates',
    (length) => {
      const password = 'p'.repeat(length);
      expect(
        accountCreateSchema.safeParse({
          name: 'Resident',
          loginIdentifier: 'resident',
          password,
          role: 'RESIDENT',
        }).success,
      ).toBe(false);
      expect(accountPatchSchema.safeParse({ password }).success).toBe(false);
    },
  );

  it('requires a nonempty strict patch and accepts release as null', () => {
    expect(accountPatchSchema.safeParse({}).success).toBe(false);
    expect(accountPatchSchema.safeParse({ password: 'bad' }).success).toBe(
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

  it('trims search and accepts blank queries and the complete login identifier length', () => {
    expect(accountListSchema.parse({ q: ' Resident ' }).q).toBe('Resident');
    expect(accountListSchema.parse({ q: '   ' }).q).toBe('');
    expect(accountListSchema.parse({ q: 'a'.repeat(254) }).q).toHaveLength(254);
    expect(accountListSchema.safeParse({ q: 'a'.repeat(255) }).success).toBe(
      false,
    );
    expect(
      accountListSchema.safeParse({ q: ['first', 'second'] }).success,
    ).toBe(false);
  });
});
