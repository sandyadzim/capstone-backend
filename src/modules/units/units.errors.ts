import { ApiErrorException } from '../../common/http/api-error.js';

export function unitsConflict(message: string): never {
  throw new ApiErrorException({ statusCode: 409, code: 'CONFLICT', message });
}

// Drizzle wraps driver errors in `cause`. Only map known constraints;
// unexpected database errors retain the global generic 500 response.
export function rethrowUnitsError(error: unknown): never {
  let current = error;
  const visited = new Set<unknown>();
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    if ('code' in current && current.code === '23505') {
      const constraint =
        'constraint_name' in current
          ? current.constraint_name
          : 'constraint' in current
            ? current.constraint
            : undefined;
      if (constraint === 'uk_units_property_number') {
        unitsConflict('Unit number is already in use');
      }
      if (constraint === 'uk_units_active_resident') {
        unitsConflict('Resident placement changed; reload and try again');
      }
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  throw error;
}
