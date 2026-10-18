import { z } from 'zod';

export const historyUnitIdSchema = z
  .object({ id: z.uuid().toLowerCase() })
  .strict();

const positiveQueryInteger = z
  .string()
  .regex(/^[0-9]+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

export const historyListSchema = z
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

export type HistoryUnitIdInput = z.infer<typeof historyUnitIdSchema>;
export type HistoryListInput = z.infer<typeof historyListSchema>;

export const dashboardTrendsSchema = z
  .object({
    months: positiveQueryInteger.pipe(z.number().max(12)).optional().default(6),
  })
  .strict();
export type DashboardTrendsInput = z.infer<typeof dashboardTrendsSchema>;
