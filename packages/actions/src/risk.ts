import type { Action, ActionType } from './schema';

/** How risky an action is to execute unsupervised. */
export type ActionRisk = 'read' | 'navigate' | 'input' | 'state_changing';

const BASE_RISK: Readonly<Record<ActionType, ActionRisk>> = {
  click: 'input',
  input_text: 'input',
  scroll: 'input',
  navigate: 'navigate',
  go_back: 'navigate',
  open_tab: 'navigate',
  switch_tab: 'navigate',
  close_tab: 'navigate',
  get_dropdown_options: 'read',
  select_dropdown_option: 'input',
  send_keys: 'input',
  wait: 'read',
  extract: 'read',
  done: 'read',
};

/**
 * Keyword signals that elevate an ordinary interaction to `state_changing`. Matches the
 * security invariant that purchase/send/delete/post/credential-entry/money-movement/
 * permission-grant/settings-change actions always require confirmation (`CLAUDE.md`).
 */
export const STATE_CHANGING_KEYWORDS: readonly string[] = [
  'submit',
  'buy',
  'purchase',
  'checkout',
  'pay',
  'payment',
  'order',
  'delete',
  'remove',
  'unsubscribe',
  'cancel subscription',
  'confirm',
  'send',
  'post',
  'publish',
  'share',
  'transfer',
  'withdraw',
  'deposit',
  'sign up',
  'subscribe',
  'accept',
  'agree',
  'save',
  'update profile',
  'change password',
  'password',
  'credit card',
  'card number',
  'cvv',
  'ssn',
  'social security',
];

function matchesStateChangingKeyword(text: string): boolean {
  const haystack = text.toLowerCase();
  return STATE_CHANGING_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

/** Extra context the classifier can use to detect a state-changing action beyond its base type. */
export interface ActionRiskContext {
  /** The accessible name/label of the action's target element, if known. */
  readonly elementName?: string;
}

/**
 * Elevates `baseRisk` to `state_changing` when `context` signals a high-risk target.
 * Only `input`-class actions (interactions with a page element) can be elevated —
 * `read`/`navigate` actions can't change page state no matter what they target.
 */
export function elevateRisk(baseRisk: ActionRisk, context: ActionRiskContext = {}): ActionRisk {
  if (baseRisk !== 'input') {
    return baseRisk;
  }
  if (context.elementName !== undefined && matchesStateChangingKeyword(context.elementName)) {
    return 'state_changing';
  }
  return baseRisk;
}

/**
 * Classifies a built-in action's risk. Each action type has a base risk; `input`-class
 * actions are elevated to `state_changing` when the target element's name matches a
 * {@link STATE_CHANGING_KEYWORDS} signal — e.g. a button named "Submit Order" or a field
 * named "Card number". This is a coarse, fast signal; the alignment critic (#23) and
 * policy engine (#21) apply deeper, per-site judgment on top.
 */
export function classifyActionRisk(action: Action, context: ActionRiskContext = {}): ActionRisk {
  return elevateRisk(BASE_RISK[action.type], context);
}
