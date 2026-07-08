import { z } from 'zod';

import { ElementRefSchema } from './common';

export const ClickActionSchema = z.object({
  type: z.literal('click'),
  ref: ElementRefSchema,
});
export type ClickAction = z.infer<typeof ClickActionSchema>;

export const InputTextActionSchema = z.object({
  type: z.literal('input_text'),
  ref: ElementRefSchema,
  text: z.string(),
});
export type InputTextAction = z.infer<typeof InputTextActionSchema>;

export const ScrollActionSchema = z.object({
  type: z.literal('scroll'),
  ref: ElementRefSchema.optional(),
  direction: z.enum(['up', 'down', 'left', 'right']),
  amount: z.number().positive().optional(),
});
export type ScrollAction = z.infer<typeof ScrollActionSchema>;

export const GetDropdownOptionsActionSchema = z.object({
  type: z.literal('get_dropdown_options'),
  ref: ElementRefSchema,
});
export type GetDropdownOptionsAction = z.infer<typeof GetDropdownOptionsActionSchema>;

export const SelectDropdownOptionActionSchema = z.object({
  type: z.literal('select_dropdown_option'),
  ref: ElementRefSchema,
  value: z.string(),
});
export type SelectDropdownOptionAction = z.infer<typeof SelectDropdownOptionActionSchema>;

export const SendKeysActionSchema = z.object({
  type: z.literal('send_keys'),
  ref: ElementRefSchema.optional(),
  keys: z.string().min(1),
});
export type SendKeysAction = z.infer<typeof SendKeysActionSchema>;
