import { z } from 'zod';

export const startWorkSchema = z
  .object({
    estimatedArrivalAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
  })
  .strict();

export type StartWorkInput = z.infer<typeof startWorkSchema>;
