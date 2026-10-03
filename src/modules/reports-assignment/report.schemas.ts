import { z } from 'zod';
import { DAMAGE_CATEGORIES, PRIORITIES } from '../database/schema.js';

export const reportIdSchema = z.object({ id: z.uuid().toLowerCase() }).strict();

export const reportCreateSchema = z
  .object({
    unitId: z.uuid().toLowerCase(),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1),
    category: z.enum(DAMAGE_CATEGORIES),
    priority: z.enum(PRIORITIES),
  })
  .strict();

const reviewNoteSchema = z.string().trim().min(1).optional();

export const reportVerifySchema = z
  .object({
    finalPriority: z.enum(PRIORITIES),
    reviewNote: reviewNoteSchema,
  })
  .strict();

export const reportRejectSchema = z
  .object({
    finalPriority: z.enum(PRIORITIES),
    rejectionReason: z.string().trim().min(1),
    reviewNote: reviewNoteSchema,
  })
  .strict();

const positiveQueryInteger = z
  .string()
  .regex(/^[0-9]+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

export const reportListSchema = z
  .object({
    page: positiveQueryInteger.optional().default(1),
    pageSize: positiveQueryInteger
      .pipe(z.number().max(100))
      .optional()
      .default(20),
  })
  .strict()
  .refine((value) => Number.isSafeInteger((value.page - 1) * value.pageSize), {
    path: ['page'],
    message: 'Pagination offset exceeds the supported range',
  });

export type ReportIdInput = z.infer<typeof reportIdSchema>;
export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type ReportVerifyInput = z.infer<typeof reportVerifySchema>;
export type ReportRejectInput = z.infer<typeof reportRejectSchema>;
export type ReportListInput = z.infer<typeof reportListSchema>;
