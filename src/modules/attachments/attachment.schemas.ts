import { z } from 'zod';

export const attachmentReportIdSchema = z
  .object({ id: z.uuid().toLowerCase() })
  .strict();
export type AttachmentReportId = z.infer<typeof attachmentReportIdSchema>;
