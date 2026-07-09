/**
 * Shared harness for driving the real, built Aegis extension against local fixture
 * pages with a local fake-model server standing in for a real LLM provider — used by
 * `apps/extension`'s Playwright E2E specs (#31, #32) and `evals/`'s reliability runner
 * (#33), which both need exactly this: load the extension, seed its model config, serve
 * fixtures, and drive a task deterministically.
 */
export type { ExtensionHandle } from './extension-context';
export { launchExtension } from './extension-context';

export type { FakeModelServerHandle, FakeModelResponder } from './fake-model-server';
export { startFakeModelServer } from './fake-model-server';

export type { StaticServerHandle } from './static-server';
export { startStaticServer } from './static-server';

export { seedModelRoutingConfig } from './seed-chrome-storage';
export { findRef } from './find-ref';
export { FIXTURES_DIR } from './fixtures-dir';

export {
  RESEARCH_AND_EXTRACT_TASK,
  RESEARCH_AND_EXTRACT_EXPECTED_SUMMARY,
  RESEARCH_AND_EXTRACT_FIXTURE,
  createResearchAndExtractResponder,
} from './scenarios/research-and-extract';
export {
  COMPARE_AND_SUMMARIZE_TASK,
  COMPARE_AND_SUMMARIZE_EXPECTED_SUMMARY,
  COMPARE_AND_SUMMARIZE_FIXTURE,
  createCompareAndSummarizeResponder,
} from './scenarios/compare-and-summarize';
export {
  AUTHENTICATED_READ_TASK,
  AUTHENTICATED_READ_EXPECTED_SUMMARY,
  AUTHENTICATED_READ_FIXTURE,
  createAuthenticatedReadResponder,
} from './scenarios/authenticated-read';
export {
  FORM_FILL_CONFIRMATION_TASK,
  FORM_FILL_CONFIRMATION_FIXTURE,
  createFormFillConfirmationResponder,
} from './scenarios/form-fill-confirmation';
