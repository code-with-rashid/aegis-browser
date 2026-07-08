import type Protocol from 'devtools-protocol/types/protocol';

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;

export function tagNameOf(node: Protocol.DOM.Node): string {
  return node.nodeName.toLowerCase();
}

export function children(node: Protocol.DOM.Node): readonly Protocol.DOM.Node[] {
  return node.children ?? [];
}

/** Parses a node's flat `[name1, value1, name2, value2, ...]` attribute array. */
export function parseAttributes(node: Protocol.DOM.Node): Record<string, string> {
  const attributes: Record<string, string> = {};
  const flat = node.attributes ?? [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const name = flat[i];
    const value = flat[i + 1];
    if (name !== undefined && value !== undefined) {
      attributes[name] = value;
    }
  }
  return attributes;
}

/** Concatenates all descendant text-node values, skipping subtrees rooted at `skipTags`. */
export function collectText(
  node: Protocol.DOM.Node,
  skipTags: ReadonlySet<string> = new Set(),
): string {
  if (node.nodeType === TEXT_NODE) {
    return node.nodeValue;
  }
  if (node.nodeType === ELEMENT_NODE && skipTags.has(tagNameOf(node))) {
    return '';
  }
  return children(node)
    .map((child) => collectText(child, skipTags))
    .filter((text) => text.length > 0)
    .join(' ');
}

/** Depth-first visits every element node (not text/comment/etc.) in the subtree. */
export function walkElements(
  node: Protocol.DOM.Node,
  visit: (element: Protocol.DOM.Node) => void,
): void {
  if (node.nodeType === ELEMENT_NODE) {
    visit(node);
  }
  for (const child of children(node)) {
    walkElements(child, visit);
  }
}
