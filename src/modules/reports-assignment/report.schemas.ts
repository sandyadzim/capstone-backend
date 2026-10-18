import { z } from 'zod';
import {
  DAMAGE_CATEGORIES,
  DAMAGE_REPORT_STATUSES,
  PRIORITIES,
} from '../database/schema.js';

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

export const reportAssignSchema = z
  .object({
    technicianUserId: z.uuid().toLowerCase(),
    note: z.string().trim().min(1).optional(),
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
    q: z.string().trim().max(160).optional(),
    status: z.enum(DAMAGE_REPORT_STATUSES).optional(),
    ongoingOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    historyOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    category: z.enum(DAMAGE_CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    sort: z.enum(['latest', 'priority']).optional(),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
  })
  .strict()
  .refine((value) => Number.isSafeInteger((value.page - 1) * value.pageSize), {
    path: ['page'],
    message: 'Pagination offset exceeds the supported range',
  })
  .refine(
    (value) =>
      !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
    {
      path: ['dateTo'],
      message: 'dateTo must be on or after dateFrom',
    },
  )
  .transform((value) => ({ ...value, q: value.q || undefined }));

export type ReportIdInput = z.infer<typeof reportIdSchema>;
export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type ReportVerifyInput = z.infer<typeof reportVerifySchema>;
export type ReportRejectInput = z.infer<typeof reportRejectSchema>;
export type ReportAssignInput = z.infer<typeof reportAssignSchema>;
export type ReportListInput = z.infer<typeof reportListSchema>;
