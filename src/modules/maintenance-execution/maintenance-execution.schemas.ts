import { z } from 'zod';
import { COST_ITEM_TYPES } from '../database/schema.js';

const requiredText = (max?: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max ?? Number.MAX_SAFE_INTEGER);

const price = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,20})(?:\.\d{1,2})?$/,
    'Must be a nonnegative decimal string with at most 21 integer digits and 2 decimals',
  );

export const startWorkSchema = z
  .object({
    estimatedArrivalAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
  })
  .strict();

export type StartWorkInput = z.infer<typeof startWorkSchema>;

export const maintenanceResultSchema = z
  .object({
    inspectionResult: requiredText(),
    problemFound: requiredText(),
    repairAction: requiredText(),
    additionalNotes: z
      .union([z.string().trim(), z.null()])
      .optional()
      .transform((value) => (value ? value || null : null)),
  })
  .strict();

export type MaintenanceResultInput = z.infer<typeof maintenanceResultSchema>;

export const costItemsSchema = z
  .object({
    items: z.array(
      z
        .object({
          type: z.enum(COST_ITEM_TYPES),
          description: requiredText(240),
          price,
        })
        .strict(),
    ),
  })
  .strict();

export type CostItemsInput = z.infer<typeof costItemsSchema>;

export const completeWorkSchema = z.preprocess(
  (value) => (value === undefined ? {} : value),
  z.object({}).strict(),
);
