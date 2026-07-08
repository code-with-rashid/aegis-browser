import { toElementRef, type ElementRef } from '@aegis/shared';

import type { ElementBounds, PerceivedElement, PerceptionSource } from '../ax/perceived-element';

const REF_PATTERN = /^(?:ax|dom):(.+)$/;

function backendNodeKeyOf(ref: ElementRef): string {
  const match = REF_PATTERN.exec(ref);
  return match?.[1] ?? ref;
}

function mergeState(
  primary: Readonly<Record<string, string | number | boolean>>,
  secondary: Readonly<Record<string, string | number | boolean>> | undefined,
): Record<string, string | number | boolean> {
  return { ...secondary, ...primary };
}

function pickBounds(
  primary: PerceivedElement,
  secondary: PerceivedElement | undefined,
): ElementBounds | undefined {
  return primary.bounds ?? secondary?.bounds;
}

function pickRole(primary: PerceivedElement, secondary: PerceivedElement | undefined): string {
  return primary.role !== 'unknown' ? primary.role : (secondary?.role ?? primary.role);
}

function pickName(primary: PerceivedElement, secondary: PerceivedElement | undefined): string {
  return primary.name.length > 0 ? primary.name : (secondary?.name ?? '');
}

function mergeOne(
  key: string,
  ax: PerceivedElement | undefined,
  dom: PerceivedElement | undefined,
): PerceivedElement {
  const primary = ax ?? dom;
  if (!primary) {
    throw new Error('mergeOne requires at least one of ax/dom to be defined');
  }
  const secondary = ax ? dom : undefined;
  const source: PerceptionSource = ax ? 'ax' : 'dom';

  const value = primary.value ?? secondary?.value;
  const bounds = pickBounds(primary, secondary);

  return {
    ref: toElementRef(`el:${key}`),
    role: pickRole(primary, secondary),
    name: pickName(primary, secondary),
    ...(value !== undefined ? { value } : {}),
    state: mergeState(primary.state, secondary?.state),
    ...(bounds !== undefined ? { bounds } : {}),
    source,
  };
}

/**
 * Merges AX- and DOM-sourced elements that refer to the same physical DOM node (matched
 * by the backend node id embedded in their ref) into one canonical entry, re-keyed to a
 * source-agnostic `el:<id>` ref. AX fields win when both sources have a real value — AX
 * is the primary perception source, DOM fills gaps (`docs/DESIGN.md` §4: "Perception").
 */
export function mergeElements(
  axElements: readonly PerceivedElement[],
  domElements: readonly PerceivedElement[],
): PerceivedElement[] {
  const byKey = new Map<string, { ax?: PerceivedElement; dom?: PerceivedElement }>();

  for (const element of axElements) {
    const key = backendNodeKeyOf(element.ref);
    const entry = byKey.get(key) ?? {};
    entry.ax = element;
    byKey.set(key, entry);
  }
  for (const element of domElements) {
    const key = backendNodeKeyOf(element.ref);
    const entry = byKey.get(key) ?? {};
    entry.dom = element;
    byKey.set(key, entry);
  }

  return [...byKey.entries()].map(([key, entry]) => mergeOne(key, entry.ax, entry.dom));
}
