import { z } from 'zod';

export const WaitActionSchema = z.object({
  type: z.literal('wait'),
  ms: z.number().int().positive().max(60_000),
});
export type WaitAction = z.infer<typeof WaitActionSchema>;

export const ExtractActionSchema = z.object({
  type: z.literal('extract'),
  instructions: z.string().min(1),
});
export type ExtractAction = z.infer<typeof ExtractActionSchema>;

export const DoneActionSchema = z.object({
  type: z.literal('done'),
  success: z.boolean(),
  summary: z.string(),
});
export type DoneAction = z.infer<typeof DoneActionSchema>;
