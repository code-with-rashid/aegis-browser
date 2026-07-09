import {
  AUTHENTICATED_READ_EXPECTED_SUMMARY,
  AUTHENTICATED_READ_FIXTURE,
  AUTHENTICATED_READ_TASK,
  COMPARE_AND_SUMMARIZE_EXPECTED_SUMMARY,
  COMPARE_AND_SUMMARIZE_FIXTURE,
  COMPARE_AND_SUMMARIZE_TASK,
  createAuthenticatedReadResponder,
  createCompareAndSummarizeResponder,
  createResearchAndExtractResponder,
  RESEARCH_AND_EXTRACT_EXPECTED_SUMMARY,
  RESEARCH_AND_EXTRACT_FIXTURE,
  RESEARCH_AND_EXTRACT_TASK,
  type FakeModelResponder,
} from '@aegis/eval-harness';

export interface EvalTask {
  readonly id: string;
  readonly task: string;
  readonly fixture: string;
  readonly expectedSummaryContains: string;
  readonly createResponder: () => FakeModelResponder;
}

/**
 * Bump this whenever a task in {@link TASK_SET} changes meaningfully (a different
 * fixture, a different expected outcome) — a report notes which version produced it,
 * so a reliability trend isn't silently compared across incompatible task definitions.
 */
export const TASK_SET_VERSION = 1;

/**
 * The versioned reliability task set (#33), seeded from #31's read-only E2E use cases —
 * `@aegis/eval-harness`'s shared fixtures/scenarios, so the same scenario that proves
 * correctness in CI also measures reliability here, with no risk of the two drifting
 * apart. See this package's README for how to add a new task.
 */
export const TASK_SET: readonly EvalTask[] = [
  {
    id: 'research-and-extract',
    task: RESEARCH_AND_EXTRACT_TASK,
    fixture: RESEARCH_AND_EXTRACT_FIXTURE,
    expectedSummaryContains: RESEARCH_AND_EXTRACT_EXPECTED_SUMMARY,
    createResponder: createResearchAndExtractResponder,
  },
  {
    id: 'compare-and-summarize',
    task: COMPARE_AND_SUMMARIZE_TASK,
    fixture: COMPARE_AND_SUMMARIZE_FIXTURE,
    expectedSummaryContains: COMPARE_AND_SUMMARIZE_EXPECTED_SUMMARY,
    createResponder: createCompareAndSummarizeResponder,
  },
  {
    id: 'authenticated-read',
    task: AUTHENTICATED_READ_TASK,
    fixture: AUTHENTICATED_READ_FIXTURE,
    expectedSummaryContains: AUTHENTICATED_READ_EXPECTED_SUMMARY,
    createResponder: createAuthenticatedReadResponder,
  },
];
