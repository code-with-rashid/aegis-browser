import type Protocol from 'devtools-protocol/types/protocol';

import { ELEMENT_NODE, TEXT_NODE } from './dom-utils';

let nextId = 1;

/** Builds a fixture `DOM.Node` element for tests — never used by production code. */
export function el(
  tag: string,
  attrs: Record<string, string> = {},
  childNodes: Protocol.DOM.Node[] = [],
): Protocol.DOM.Node {
  const id = nextId++;
  return {
    nodeId: id,
    backendNodeId: id,
    nodeType: ELEMENT_NODE,
    nodeName: tag.toUpperCase(),
    localName: tag.toLowerCase(),
    nodeValue: '',
    attributes: Object.entries(attrs).flat(),
    children: childNodes,
    childNodeCount: childNodes.length,
  };
}

/** Builds a fixture `DOM.Node` text node for tests. */
export function text(value: string): Protocol.DOM.Node {
  const id = nextId++;
  return {
    nodeId: id,
    backendNodeId: id,
    nodeType: TEXT_NODE,
    nodeName: '#text',
    localName: '',
    nodeValue: value,
  };
}
