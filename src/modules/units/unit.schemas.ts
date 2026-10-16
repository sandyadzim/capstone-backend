import { z } from 'zod';
import { UNIT_DISPLAY_STATUSES } from './unit.dto.js';

const nonemptyPatch = (value: object) => Object.keys(value).length > 0;
export const unitIdSchema = z.object({ id: z.uuid().toLowerCase() }).strict();

export const unitCreateSchema = z
  .object({
    unitNumber: z.string().trim().min(1).max(40),
    floor: z.number().int().min(-32768).max(32767),
    maintenanceFlag: z.boolean().optional(),
  })
  .strict();
export const unitPatchSchema = unitCreateSchema
  .partial()
  .refine(nonemptyPatch, 'Provide at least one field to update');
export const residentPlacementSchema = z
  .object({
    residentUserId: z.uuid().toLowerCase(),
    unassignedOnly: z.boolean().optional(),
  })
  .strict();

const positiveQueryInteger = z
  .string()
  .regex(/^[0-9]+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
export const unitListSchema = z
  .object({
    page: positiveQueryInteger.optional().default(1),
    pageSize: positiveQueryInteger
      .pipe(z.number().max(100))
      .optional()
      .default(20),
    q: z.string().trim().max(40).optional(),
    displayStatus: z.enum(UNIT_DISPLAY_STATUSES).optional(),
    isArchived: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
      .default(false),
  })
  .strict()
  .refine((value) => Number.isSafeInteger((value.page - 1) * value.pageSize), {
    path: ['page'],
    message: 'Pagination offset exceeds the supported range',
  })
  .transform((value) => ({ ...value, q: value.q || undefined }));

export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type UnitPatchInput = z.infer<typeof unitPatchSchema>;
export type UnitListInput = z.infer<typeof unitListSchema>;
export type UnitIdInput = z.infer<typeof unitIdSchema>;
export type ResidentPlacementInput = z.infer<typeof residentPlacementSchema>;
