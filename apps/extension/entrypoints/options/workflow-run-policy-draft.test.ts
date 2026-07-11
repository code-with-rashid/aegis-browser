import type { RunPolicy } from '@aegis/workflows';
import { describe, expect, it } from 'vitest';

import { draftFromRunPolicy, runPolicyFromDraft } from './workflow-run-policy-draft';

describe('draftFromRunPolicy', () => {
  it('joins allow-lists with a comma and space', () => {
    const draft = draftFromRunPolicy({
      allowedToolIds: ['browser.click', 'browser.input_text'],
      allowedOrigins: ['https://example.com'],
      allowStateChanging: true,
      maxStepsPerRun: 20,
      maxRunsPerDay: 5,
    });
    expect(draft.allowedToolIds).toBe('browser.click, browser.input_text');
    expect(draft.allowedOrigins).toBe('https://example.com');
    expect(draft.allowStateChanging).toBe(true);
    expect(draft.maxStepsPerRun).toBe('20');
    expect(draft.maxRunsPerDay).toBe('5');
  });

  it('renders an unset limit as an empty string', () => {
    const draft = draftFromRunPolicy({
      allowedToolIds: [],
      allowedOrigins: [],
      allowStateChanging: false,
    });
    expect(draft.maxStepsPerRun).toBe('');
    expect(draft.maxRunsPerDay).toBe('');
  });
});

describe('runPolicyFromDraft', () => {
  it('splits a comma-separated list, trimming whitespace and dropping empties', () => {
    const policy = runPolicyFromDraft({
      allowedToolIds: ' browser.click ,, browser.input_text,',
      allowedOrigins: 'https://example.com',
      allowStateChanging: false,
      maxStepsPerRun: '',
      maxRunsPerDay: '',
    });
    expect(policy.allowedToolIds).toEqual(['browser.click', 'browser.input_text']);
    expect(policy.allowedOrigins).toEqual(['https://example.com']);
  });

  it('treats a blank list as empty, not ["")]', () => {
    const policy = runPolicyFromDraft({
      allowedToolIds: '',
      allowedOrigins: '',
      allowStateChanging: false,
      maxStepsPerRun: '',
      maxRunsPerDay: '',
    });
    expect(policy.allowedToolIds).toEqual([]);
    expect(policy.allowedOrigins).toEqual([]);
  });

  it('omits maxStepsPerRun/maxRunsPerDay entirely when blank', () => {
    const policy = runPolicyFromDraft({
      allowedToolIds: '',
      allowedOrigins: '',
      allowStateChanging: false,
      maxStepsPerRun: '',
      maxRunsPerDay: '',
    });
    expect('maxStepsPerRun' in policy).toBe(false);
    expect('maxRunsPerDay' in policy).toBe(false);
  });

  it('omits a non-positive limit rather than passing 0 or a negative number through', () => {
    const policy = runPolicyFromDraft({
      allowedToolIds: '',
      allowedOrigins: '',
      allowStateChanging: false,
      maxStepsPerRun: '0',
      maxRunsPerDay: '-5',
    });
    expect('maxStepsPerRun' in policy).toBe(false);
    expect('maxRunsPerDay' in policy).toBe(false);
  });

  it('parses a valid positive limit', () => {
    const policy = runPolicyFromDraft({
      allowedToolIds: '',
      allowedOrigins: '',
      allowStateChanging: false,
      maxStepsPerRun: '20',
      maxRunsPerDay: '5',
    });
    expect(policy.maxStepsPerRun).toBe(20);
    expect(policy.maxRunsPerDay).toBe(5);
  });

  it('carries allowStateChanging through', () => {
    const policy = runPolicyFromDraft({
      allowedToolIds: '',
      allowedOrigins: '',
      allowStateChanging: true,
      maxStepsPerRun: '',
      maxRunsPerDay: '',
    });
    expect(policy.allowStateChanging).toBe(true);
  });

  it('round-trips through draftFromRunPolicy', () => {
    const original: RunPolicy = {
      allowedToolIds: ['browser.click'],
      allowedOrigins: ['https://example.com'],
      allowStateChanging: true,
      maxStepsPerRun: 10,
      maxRunsPerDay: 3,
    };
    expect(runPolicyFromDraft(draftFromRunPolicy(original))).toEqual(original);
  });
});
