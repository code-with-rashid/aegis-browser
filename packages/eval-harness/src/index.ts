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
export type { McpServerSeed } from './seed-mcp-chrome-storage';
export { seedMcpServer } from './seed-mcp-chrome-storage';
export type {
  WorkflowRunRecordSnapshot,
  WorkflowSeed,
  WorkflowStepSeed,
} from './seed-workflow-chrome-storage';
export {
  readWorkflowRuns,
  seedWorkflows,
  waitForWorkflowRuns,
} from './seed-workflow-chrome-storage';
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
export {
  INJECTED_PURCHASE_ATTEMPT_TASK,
  INJECTED_PURCHASE_ATTEMPT_FIXTURE,
  INJECTED_PURCHASE_ATTEMPT_EXPECTED_SUMMARY,
  createInjectedPurchaseAttemptResponder,
} from './scenarios/injected-purchase-attempt';
export {
  INJECTED_NAVIGATE_ATTEMPT_TASK,
  INJECTED_NAVIGATE_ATTEMPT_FIXTURE,
  INJECTED_NAVIGATE_ATTEMPT_EXPECTED_SUMMARY,
  createInjectedNavigateAttemptResponder,
} from './scenarios/injected-navigate-attempt';
export {
  WEBMCP_SHIPPING_TASK,
  WEBMCP_SHIPPING_EXPECTED_SUMMARY,
  WEBMCP_SHIPPING_FIXTURE,
  WEBMCP_SHIPPING_FALLBACK_FIXTURE,
  createWebMcpShippingResponder,
  createWebMcpShippingFallbackResponder,
} from './scenarios/webmcp-shipping';
export {
  MCP_TOOL_TASK,
  MCP_TOOL_TASK_FIXTURE,
  MCP_TOOL_TASK_EXPECTED_SUMMARY,
  MCP_TOOL_ID,
  createMcpToolTaskResponder,
} from './scenarios/mcp-tool-task';
export {
  MCP_TOOL_CONFIRMATION_TASK,
  MCP_TOOL_CONFIRMATION_TOOL_ID,
  createMcpToolConfirmationResponder,
} from './scenarios/mcp-tool-confirmation';
export {
  HOSTILE_TOOL_DESCRIPTION_TASK,
  HOSTILE_TOOL_DESCRIPTION_FIXTURE,
  HOSTILE_TOOL_DESCRIPTION_EXPECTED_SUMMARY,
  createHostileToolDescriptionResponder,
} from './scenarios/hostile-tool-description';
export {
  HOSTILE_WEBMCP_CONFIRMATION_TASK,
  HOSTILE_WEBMCP_CONFIRMATION_EXPECTED_SUMMARY,
  createHostileWebMcpToolConfirmationResponder,
} from './scenarios/hostile-webmcp-tool-confirmation';
export {
  HOSTILE_MCP_TOOL_TASK,
  HOSTILE_MCP_TOOL_ID,
  createHostileMcpToolConfirmationResponder,
} from './scenarios/hostile-mcp-tool-confirmation';
export {
  WORKFLOW_HEAL_FIXTURE_V1,
  WORKFLOW_HEAL_FIXTURE_V2,
  WORKFLOW_HEAL_INJECTED_FIXTURE,
  createWorkflowHealHostileResponder,
  createWorkflowHealResponder,
  workflowHealSeed,
} from './scenarios/workflow-self-heal';
