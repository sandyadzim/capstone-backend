import { z } from 'zod';
import { USER_ROLES } from '../database/schema.js';

const passwordSchema = z.string().min(4).max(30);
const accountFields = {
  name: z.string().trim().min(1).max(160),
  loginIdentifier: z
    .string()
    .trim()
    .transform((identifier) => identifier.toLowerCase())
    .pipe(z.string().min(1).max(254)),
  password: passwordSchema,
  role: z.enum(USER_ROLES),
  isActive: z.boolean(),
  unitId: z.union([z.uuid().toLowerCase(), z.null()]),
};

export const accountIdSchema = z
  .object({ id: z.uuid().toLowerCase() })
  .strict();

export const accountCreateSchema = z
  .object({
    name: accountFields.name,
    loginIdentifier: accountFields.loginIdentifier,
    password: accountFields.password,
    role: accountFields.role,
    isActive: accountFields.isActive.optional().default(true),
    unitId: accountFields.unitId.optional(),
  })
  .strict();

export const accountPatchSchema = z
  .object({
    name: accountFields.name.optional(),
    loginIdentifier: accountFields.loginIdentifier.optional(),
    password: accountFields.password.optional(),
    role: accountFields.role.optional(),
    isActive: accountFields.isActive.optional(),
    unitId: accountFields.unitId.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

const positiveQueryInteger = z
  .string()
  .regex(/^[0-9]+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

export const accountListSchema = z
  .object({
    page: positiveQueryInteger.optional().default(1),
    pageSize: positiveQueryInteger
      .pipe(z.number().max(100))
      .optional()
      .default(20),
    q: z.string().trim().max(254).optional(),
    role: z.enum(USER_ROLES).optional(),
    unassignedOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict()
  .refine((value) => Number.isSafeInteger((value.page - 1) * value.pageSize), {
    path: ['page'],
    message: 'Pagination offset exceeds the supported range',
  });

export type AccountIdInput = z.infer<typeof accountIdSchema>;
export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
export type AccountPatchInput = z.infer<typeof accountPatchSchema>;
export type AccountListInput = z.infer<typeof accountListSchema>;
