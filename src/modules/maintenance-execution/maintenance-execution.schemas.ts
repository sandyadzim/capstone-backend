import { z } from 'zod';
import { COST_ITEM_TYPES } from '../database/schema.js';

const requiredText = (max?: number) =>
  z.string().trim().min(1).max(max ?? Number.MAX_SAFE_INTEGER);

function decimal(maxIntegerDigits: number, maxScale: number, positive: boolean) {
  return z
    .string()
    .regex(
      new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${maxScale}})?$`),
      'Must be a plain decimal string with supported precision',
    )
    .refine((value) => value.split('.')[0]!.length <= maxIntegerDigits, {
      message: `Must have at most ${maxIntegerDigits} integer digits`,
    })
    .refine((value) => !positive || Number(value) > 0, {
      message: 'Must be greater than zero',
    });
}

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
    items: z
      .array(
        z
          .object({
            type: z.enum(COST_ITEM_TYPES),
            description: requiredText(240),
            quantity: decimal(9, 3, true),
            unitPrice: decimal(12, 2, false),
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
