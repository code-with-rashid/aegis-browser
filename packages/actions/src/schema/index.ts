import { z } from 'zod';

import {
  ClickActionSchema,
  GetDropdownOptionsActionSchema,
  InputTextActionSchema,
  ScrollActionSchema,
  SelectDropdownOptionActionSchema,
  SendKeysActionSchema,
} from './element-actions';
import { DoneActionSchema, ExtractActionSchema, WaitActionSchema } from './meta-actions';
import {
  CloseTabActionSchema,
  GoBackActionSchema,
  NavigateActionSchema,
  OpenTabActionSchema,
  SwitchTabActionSchema,
} from './navigation-actions';

export * from './element-actions';
export * from './meta-actions';
export * from './navigation-actions';

/** Every action type the agent loop can emit, as a Zod discriminated union on `type`. */
export const ActionSchema = z.discriminatedUnion('type', [
  ClickActionSchema,
  InputTextActionSchema,
  ScrollActionSchema,
  NavigateActionSchema,
  GoBackActionSchema,
  OpenTabActionSchema,
  SwitchTabActionSchema,
  CloseTabActionSchema,
  GetDropdownOptionsActionSchema,
  SelectDropdownOptionActionSchema,
  SendKeysActionSchema,
  WaitActionSchema,
  ExtractActionSchema,
  DoneActionSchema,
]);

export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action['type'];
