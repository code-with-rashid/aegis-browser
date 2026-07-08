import type Protocol from 'devtools-protocol/types/protocol';
import { describe, expect, it } from 'vitest';

import { normalizeAxTree } from './ax-tree-normalizer';

function axValue(value: unknown): Protocol.Accessibility.AXValue {
  return { type: 'string', value };
}

/** A recorded fixture: a simple page with a heading, a button, and a text input. */
const SIMPLE_PAGE_NODES: Protocol.Accessibility.AXNode[] = [
  {
    nodeId: '1',
    ignored: false,
    role: axValue('RootWebArea'),
    name: axValue('Example page'),
    childIds: ['2', '3', '4'],
    backendDOMNodeId: 100,
  },
  {
    nodeId: '2',
    ignored: false,
    role: axValue('heading'),
    name: axValue('Welcome'),
    parentId: '1',
    backendDOMNodeId: 101,
  },
  {
    nodeId: '3',
    ignored: false,
    role: axValue('button'),
    name: axValue('Submit'),
    parentId: '1',
    backendDOMNodeId: 102,
    properties: [
      { name: 'focusable', value: axValue(true) },
      { name: 'disabled', value: axValue(false) },
    ],
  },
  {
    nodeId: '4',
    ignored: false,
    role: axValue('textbox'),
    name: axValue('Email address'),
    value: axValue('user@example.com'),
    parentId: '1',
    backendDOMNodeId: 103,
    properties: [{ name: 'required', value: axValue(true) }],
  },
  {
    nodeId: '5',
    ignored: true,
    ignoredReasons: [],
    parentId: '1',
    backendDOMNodeId: 104,
  },
  {
    // No backing DOM node — e.g. a purely computed AX-only node.
    nodeId: '6',
    ignored: false,
    role: axValue('generic'),
    parentId: '1',
  },
];

describe('normalizeAxTree', () => {
  it('normalizes role/name/value for a recorded fixture', () => {
    const { elements } = normalizeAxTree(SIMPLE_PAGE_NODES);

    const heading = elements.find((el) => el.role === 'heading');
    expect(heading?.name).toBe('Welcome');

    const textbox = elements.find((el) => el.role === 'textbox');
    expect(textbox?.name).toBe('Email address');
    expect(textbox?.value).toBe('user@example.com');
  });

  it('extracts boolean/primitive AX properties into state', () => {
    const { elements } = normalizeAxTree(SIMPLE_PAGE_NODES);
    const button = elements.find((el) => el.role === 'button');
    expect(button?.state).toEqual({ focusable: true, disabled: false });
  });

  it('drops nodes CDP marks ignored', () => {
    const { elements } = normalizeAxTree(SIMPLE_PAGE_NODES);
    expect(elements.some((el) => el.role === 'generic' && el.name === '')).toBe(false);
    expect(elements).toHaveLength(4);
  });

  it('drops nodes with no backing DOM node', () => {
    const { elements } = normalizeAxTree(SIMPLE_PAGE_NODES);
    // The "generic" node (nodeId 6) has no backendDOMNodeId and must not appear.
    expect(elements.some((el) => el.role === 'generic')).toBe(false);
  });

  it('maps each ref back to its backend DOM node id', () => {
    const { elements, refToBackendNodeId } = normalizeAxTree(SIMPLE_PAGE_NODES);
    const button = elements.find((el) => el.role === 'button');
    if (!button) {
      throw new Error('expected a button element in the normalized output');
    }
    expect(refToBackendNodeId.get(button.ref)).toBe(102);
  });

  it('tags every element with source "ax"', () => {
    const { elements } = normalizeAxTree(SIMPLE_PAGE_NODES);
    expect(elements.every((el) => el.source === 'ax')).toBe(true);
  });

  it('produces identical refs when the same fixture is normalized twice', () => {
    const first = normalizeAxTree(SIMPLE_PAGE_NODES);
    const second = normalizeAxTree(SIMPLE_PAGE_NODES);

    expect(first.elements.map((el) => el.ref)).toEqual(second.elements.map((el) => el.ref));
  });

  it('assigns the same ref to a node whose backendDOMNodeId is unchanged across re-reads, even if other nodes changed', () => {
    const mutatedPage: Protocol.Accessibility.AXNode[] = [
      ...SIMPLE_PAGE_NODES,
      {
        nodeId: '7',
        ignored: false,
        role: axValue('alert'),
        name: axValue('New notification'),
        parentId: '1',
        backendDOMNodeId: 200,
      },
    ];

    const before = normalizeAxTree(SIMPLE_PAGE_NODES);
    const after = normalizeAxTree(mutatedPage);

    const beforeButton = before.elements.find((el) => el.role === 'button');
    const afterButton = after.elements.find((el) => el.role === 'button');
    expect(afterButton?.ref).toBe(beforeButton?.ref);
  });
});
