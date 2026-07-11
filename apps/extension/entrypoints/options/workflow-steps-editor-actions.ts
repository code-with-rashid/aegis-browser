import type { WorkflowStep } from '@aegis/workflows';

/** Editing a recorded step's own `args`/`target`/`expect` is out of scope (#119 only views/reorders/deletes) — a step's content is exactly what was recorded and replayed; only its position and presence in the list are safe to change from this UI. */
export function moveStepUp(steps: readonly WorkflowStep[], index: number): WorkflowStep[] {
  if (index <= 0 || index >= steps.length) {
    return [...steps];
  }
  const next = [...steps];
  const [step] = next.splice(index, 1);
  if (step === undefined) {
    return next;
  }
  next.splice(index - 1, 0, step);
  return next;
}

export function moveStepDown(steps: readonly WorkflowStep[], index: number): WorkflowStep[] {
  if (index < 0 || index >= steps.length - 1) {
    return [...steps];
  }
  const next = [...steps];
  const [step] = next.splice(index, 1);
  if (step === undefined) {
    return next;
  }
  next.splice(index + 1, 0, step);
  return next;
}

export function removeStepAt(steps: readonly WorkflowStep[], index: number): WorkflowStep[] {
  return steps.filter((_step, i) => i !== index);
}

/** A short, human-readable summary of what a step targets — `selector` first (the most resilient), falling back to the accessible `role`/`name`, or `ref` as a last resort; `undefined` if the step recorded no target at all (e.g. a `wait`). */
export function targetSummary(step: WorkflowStep): string | undefined {
  const target = step.target;
  if (target === undefined) {
    return undefined;
  }
  if (target.selector !== undefined) {
    return target.selector;
  }
  if (target.role !== undefined || target.name !== undefined) {
    return [target.role, target.name].filter((part) => part !== undefined).join(' ');
  }
  return target.ref;
}

/** A short, human-readable summary of a step's post-condition, or `undefined` if it has none. */
export function expectSummary(step: WorkflowStep): string | undefined {
  const expect = step.expect;
  if (expect === undefined) {
    return undefined;
  }
  switch (expect.type) {
    case 'element_visible':
      return `element visible: ${expect.selector}`;
    case 'element_hidden':
      return `element hidden: ${expect.selector}`;
    case 'url_matches':
      return `URL matches: ${expect.pattern}`;
    case 'text_contains':
      return `text contains: ${expect.text}`;
  }
}
