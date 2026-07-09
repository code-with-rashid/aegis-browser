import {
  ClickActionSchema,
  CloseTabActionSchema,
  DoneActionSchema,
  ExtractActionSchema,
  GetDropdownOptionsActionSchema,
  GoBackActionSchema,
  InputTextActionSchema,
  NavigateActionSchema,
  OpenTabActionSchema,
  ScrollActionSchema,
  SelectDropdownOptionActionSchema,
  SendKeysActionSchema,
  SwitchTabActionSchema,
  WaitActionSchema,
} from '@aegis/actions';
import { z } from 'zod';

const PlainRef = z.string().min(1);

/**
 * A transform-free mirror of `@aegis/actions`' `ActionSchema`, for use ONLY as the
 * schema handed to `generateStructured`. Zod v4's `z.toJSONSchema()` (which
 * `generateStructured` calls to build the model's prompt instructions) cannot represent
 * the `.transform()` `ActionSchema` uses to brand `ref` as an `ElementRef` — branding is
 * a compile-time-only concept; at the JSON level a ref is just a string. Each schema
 * here is the real one with only `ref` overridden, so any other field change to an
 * action schema propagates here automatically. After a successful `generateStructured`
 * call, re-parse the raw actions through the real `ActionSchema` to get properly-branded
 * `Action`s — see `create-navigator-service.ts`.
 */
export const LlmActionSchema = z.discriminatedUnion('type', [
  ClickActionSchema.extend({ ref: PlainRef }),
  InputTextActionSchema.extend({ ref: PlainRef }),
  ScrollActionSchema.extend({ ref: PlainRef.optional() }),
  NavigateActionSchema,
  GoBackActionSchema,
  OpenTabActionSchema,
  SwitchTabActionSchema,
  CloseTabActionSchema,
  GetDropdownOptionsActionSchema.extend({ ref: PlainRef }),
  SelectDropdownOptionActionSchema.extend({ ref: PlainRef }),
  SendKeysActionSchema.extend({ ref: PlainRef.optional() }),
  WaitActionSchema,
  ExtractActionSchema,
  DoneActionSchema,
]);

export type LlmAction = z.infer<typeof LlmActionSchema>;
