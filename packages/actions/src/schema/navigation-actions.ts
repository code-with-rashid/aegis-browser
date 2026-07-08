import { z } from 'zod';

export const NavigateActionSchema = z.object({
  type: z.literal('navigate'),
  url: z.url(),
});
export type NavigateAction = z.infer<typeof NavigateActionSchema>;

export const GoBackActionSchema = z.object({
  type: z.literal('go_back'),
});
export type GoBackAction = z.infer<typeof GoBackActionSchema>;

export const OpenTabActionSchema = z.object({
  type: z.literal('open_tab'),
  url: z.url().optional(),
});
export type OpenTabAction = z.infer<typeof OpenTabActionSchema>;

export const SwitchTabActionSchema = z.object({
  type: z.literal('switch_tab'),
  tabId: z.number().int().nonnegative(),
});
export type SwitchTabAction = z.infer<typeof SwitchTabActionSchema>;

export const CloseTabActionSchema = z.object({
  type: z.literal('close_tab'),
  tabId: z.number().int().nonnegative().optional(),
});
export type CloseTabAction = z.infer<typeof CloseTabActionSchema>;
