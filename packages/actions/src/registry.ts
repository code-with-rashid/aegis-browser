import { AegisError, err, ok, type Result } from '@aegis/shared';
import type { z } from 'zod';

import { elevateRisk, type ActionRisk, type ActionRiskContext } from './risk';
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
  type Action,
} from './schema';
import { ActionSchema } from './schema';

export type ActionValidationErrorCode = 'ACTION_UNKNOWN_TYPE' | 'ACTION_INVALID_PARAMS';

/** Typed error raised when validating a raw action against a registry or schema fails. */
export class ActionValidationError extends AegisError {
  readonly code: ActionValidationErrorCode;

  constructor(code: ActionValidationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/** A validated action of any registered type — a built-in, or a future MCP tool-action. */
export interface RegisteredAction {
  readonly type: string;
  readonly [key: string]: unknown;
}

/** One registered action type: its schema and base risk. */
export interface ActionDescriptor {
  readonly type: string;
  readonly schema: z.ZodType;
  readonly baseRisk: ActionRisk;
}

function extractType(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const candidate = raw as { type?: unknown };
  return typeof candidate.type === 'string' ? candidate.type : undefined;
}

/**
 * A runtime registry of action types, their Zod schemas, and base risk — extensible so
 * MCP tool-actions (Phase 2) can register alongside the 14 built-ins without changing
 * this API. For compile-time-typed access to just the built-ins, use {@link ActionSchema}
 * / {@link validateAction} / `classifyActionRisk` directly instead.
 */
export class ActionRegistry {
  private readonly descriptors = new Map<string, ActionDescriptor>();

  register(descriptor: ActionDescriptor): void {
    this.descriptors.set(descriptor.type, descriptor);
  }

  get(type: string): ActionDescriptor | undefined {
    return this.descriptors.get(type);
  }

  list(): readonly ActionDescriptor[] {
    return [...this.descriptors.values()];
  }

  validate(raw: unknown): Result<RegisteredAction, ActionValidationError> {
    const type = extractType(raw);
    if (type === undefined) {
      return err(
        new ActionValidationError(
          'ACTION_INVALID_PARAMS',
          'Action is missing a string "type" field',
        ),
      );
    }

    const descriptor = this.descriptors.get(type);
    if (!descriptor) {
      return err(new ActionValidationError('ACTION_UNKNOWN_TYPE', `Unknown action type "${type}"`));
    }

    const parsed = descriptor.schema.safeParse(raw);
    if (!parsed.success) {
      return err(
        new ActionValidationError(
          'ACTION_INVALID_PARAMS',
          `Invalid params for action "${type}": ${parsed.error.message}`,
          { cause: parsed.error },
        ),
      );
    }

    return ok(parsed.data as RegisteredAction);
  }

  /** Classifies risk by registered type, defaulting unknown types to the most restrictive risk. */
  classify(type: string, context: ActionRiskContext = {}): ActionRisk {
    const baseRisk = this.descriptors.get(type)?.baseRisk ?? 'state_changing';
    return elevateRisk(baseRisk, context);
  }
}

const BUILT_IN_DESCRIPTORS: readonly ActionDescriptor[] = [
  { type: 'click', schema: ClickActionSchema, baseRisk: 'input' },
  { type: 'input_text', schema: InputTextActionSchema, baseRisk: 'input' },
  { type: 'scroll', schema: ScrollActionSchema, baseRisk: 'input' },
  { type: 'navigate', schema: NavigateActionSchema, baseRisk: 'navigate' },
  { type: 'go_back', schema: GoBackActionSchema, baseRisk: 'navigate' },
  { type: 'open_tab', schema: OpenTabActionSchema, baseRisk: 'navigate' },
  { type: 'switch_tab', schema: SwitchTabActionSchema, baseRisk: 'navigate' },
  { type: 'close_tab', schema: CloseTabActionSchema, baseRisk: 'navigate' },
  { type: 'get_dropdown_options', schema: GetDropdownOptionsActionSchema, baseRisk: 'read' },
  { type: 'select_dropdown_option', schema: SelectDropdownOptionActionSchema, baseRisk: 'input' },
  { type: 'send_keys', schema: SendKeysActionSchema, baseRisk: 'input' },
  { type: 'wait', schema: WaitActionSchema, baseRisk: 'read' },
  { type: 'extract', schema: ExtractActionSchema, baseRisk: 'read' },
  { type: 'done', schema: DoneActionSchema, baseRisk: 'read' },
];

/** Builds an {@link ActionRegistry} pre-populated with all 14 built-in action types. */
export function createDefaultActionRegistry(): ActionRegistry {
  const registry = new ActionRegistry();
  for (const descriptor of BUILT_IN_DESCRIPTORS) {
    registry.register(descriptor);
  }
  return registry;
}

/** Validates a raw action against the 14 built-in schemas, with full compile-time typing. */
export function validateAction(raw: unknown): Result<Action, ActionValidationError> {
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ActionValidationError(
        'ACTION_INVALID_PARAMS',
        `Invalid action: ${parsed.error.message}`,
        {
          cause: parsed.error,
        },
      ),
    );
  }
  return ok(parsed.data);
}
