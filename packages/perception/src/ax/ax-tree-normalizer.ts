import type Protocol from 'devtools-protocol/types/protocol';

import { toElementRef, type ElementRef } from '@aegis/shared';

import type { PerceivedElement } from './perceived-element';

/** The result of normalizing a raw AX tree: elements plus the ref → backend DOM node map actions need. */
export interface NormalizedAxTree {
  readonly elements: readonly PerceivedElement[];
  readonly refToBackendNodeId: ReadonlyMap<ElementRef, Protocol.DOM.BackendNodeId>;
}

function refForBackendNode(backendNodeId: Protocol.DOM.BackendNodeId): ElementRef {
  return toElementRef(`ax:${backendNodeId}`);
}

function stringValueOf(axValue: Protocol.Accessibility.AXValue | undefined): string | undefined {
  const value: unknown = axValue?.value;
  return typeof value === 'string' ? value : undefined;
}

function primitiveValueOf(axValue: Protocol.Accessibility.AXValue | undefined): string | undefined {
  const value: unknown = axValue?.value;
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function extractState(
  node: Protocol.Accessibility.AXNode,
): Record<string, string | number | boolean> {
  const state: Record<string, string | number | boolean> = {};
  for (const property of node.properties ?? []) {
    const value: unknown = property.value.value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      state[property.name] = value;
    }
  }
  return state;
}

/**
 * Normalizes a raw `Accessibility.getFullAXTree` node list into {@link PerceivedElement}s
 * with stable refs.
 *
 * Nodes CDP itself marks `ignored` (accessibility-irrelevant) and nodes with no backing
 * DOM node (nothing an action could target) are dropped. Each ref is derived
 * deterministically from `backendDOMNodeId`, so re-reading the same page produces the
 * same ref for the same element — no per-session ref registry needed.
 */
export function normalizeAxTree(nodes: readonly Protocol.Accessibility.AXNode[]): NormalizedAxTree {
  const elements: PerceivedElement[] = [];
  const refToBackendNodeId = new Map<ElementRef, Protocol.DOM.BackendNodeId>();

  for (const node of nodes) {
    if (node.ignored || node.backendDOMNodeId === undefined) {
      continue;
    }

    const ref = refForBackendNode(node.backendDOMNodeId);
    const value = primitiveValueOf(node.value);

    elements.push({
      ref,
      role: stringValueOf(node.role) ?? 'unknown',
      name: stringValueOf(node.name) ?? '',
      ...(value !== undefined ? { value } : {}),
      state: extractState(node),
      source: 'ax',
    });
    refToBackendNodeId.set(ref, node.backendDOMNodeId);
  }

  return { elements, refToBackendNodeId };
}
