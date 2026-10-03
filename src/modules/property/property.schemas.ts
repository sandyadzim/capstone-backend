import { z } from 'zod';

const nonemptyPatch = (value: object) => Object.keys(value).length > 0;
export const propertyPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    address: z.string().trim().min(1).optional(),
    logoUrl: z.null().optional(),
  })
  .strict()
  .refine(nonemptyPatch, 'Provide at least one field to update');

export type PropertyPatchInput = z.infer<typeof propertyPatchSchema>;
