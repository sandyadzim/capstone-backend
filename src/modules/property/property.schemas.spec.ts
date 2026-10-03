import { propertyPatchSchema } from './property.schemas.js';

describe('Property profile contracts', () => {
  it('trims and accepts nonempty profile fields and an explicit logo clear', () => {
    expect(
      propertyPatchSchema.parse({
        name: ' Property ',
        address: ' Address ',
        logoUrl: null,
      }),
    ).toEqual({ name: 'Property', address: 'Address', logoUrl: null });
  });

  it.each([
    {},
    { name: ' ' },
    { address: '' },
    { logoUrl: 'https://example.test/logo.png' },
    { id: 'fake' },
  ])('rejects invalid or empty profile patch %j', (input) => {
    expect(propertyPatchSchema.safeParse(input).success).toBe(false);
  });
});
