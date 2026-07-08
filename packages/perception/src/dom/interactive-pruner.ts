import type Protocol from 'devtools-protocol/types/protocol';

import { toElementRef } from '@aegis/shared';

import type { PerceivedElement } from '../ax/perceived-element';
import { collectText, parseAttributes, tagNameOf, walkElements } from './dom-utils';

const INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'option',
  'summary',
]);
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'textbox',
  'combobox',
  'menuitem',
  'tab',
  'switch',
  'slider',
  'option',
]);

function isInteractive(tag: string, attrs: Record<string, string>): boolean {
  if (INTERACTIVE_TAGS.has(tag)) {
    return true;
  }
  const role = attrs['role'];
  if (role !== undefined && INTERACTIVE_ROLES.has(role)) {
    return true;
  }
  if (attrs['onclick'] !== undefined) {
    return true;
  }
  const tabindex = attrs['tabindex'];
  return tabindex !== undefined && tabindex !== '-1';
}

function nameFor(node: Protocol.DOM.Node, tag: string, attrs: Record<string, string>): string {
  const ariaLabel = attrs['aria-label'];
  if (ariaLabel !== undefined) {
    return ariaLabel;
  }
  if (tag === 'input' || tag === 'textarea') {
    const placeholder = attrs['placeholder'];
    if (placeholder !== undefined) {
      return placeholder;
    }
    const value = attrs['value'];
    if (value !== undefined) {
      return value;
    }
  }
  const text = collectText(node).trim();
  if (text.length > 0) {
    return text;
  }
  return attrs['alt'] ?? attrs['title'] ?? '';
}

function stateFor(attrs: Record<string, string>): Record<string, string | number | boolean> {
  const state: Record<string, string | number | boolean> = {};
  if (attrs['disabled'] !== undefined) {
    state['disabled'] = true;
  }
  if (attrs['checked'] !== undefined) {
    state['checked'] = true;
  }
  if (attrs['required'] !== undefined) {
    state['required'] = true;
  }
  const ariaExpanded = attrs['aria-expanded'];
  if (ariaExpanded !== undefined) {
    state['expanded'] = ariaExpanded === 'true';
  }
  return state;
}

/**
 * Prunes a raw `DOM.getDocument` tree down to interactive elements (links, buttons,
 * form controls, `<option>`s, and anything with an interactive ARIA role or click
 * handler), tagged `source: 'dom'` so they can be merged with AX-sourced
 * {@link PerceivedElement}s in the perception aggregator (#10).
 */
export function pruneInteractiveElements(root: Protocol.DOM.Node): PerceivedElement[] {
  const elements: PerceivedElement[] = [];

  walkElements(root, (node) => {
    const tag = tagNameOf(node);
    const attrs = parseAttributes(node);
    if (!isInteractive(tag, attrs)) {
      return;
    }

    const value = attrs['value'];
    elements.push({
      ref: toElementRef(`dom:${node.backendNodeId}`),
      role: attrs['role'] ?? tag,
      name: nameFor(node, tag, attrs),
      ...(value !== undefined ? { value } : {}),
      state: stateFor(attrs),
      source: 'dom',
    });
  });

  return elements;
}
