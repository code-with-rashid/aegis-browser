export type { RunRecordId, WorkflowId, WorkflowStepId } from './ids';
export { toRunRecordId, toWorkflowId, toWorkflowStepId } from './ids';

export type { WorkflowErrorCode } from './errors';
export { WorkflowError } from './errors';

export type {
  PostCondition,
  PostConditionType,
  RunPolicy,
  Workflow,
  WorkflowParam,
  WorkflowParamKind,
  WorkflowStep,
  WorkflowTarget,
} from './schema';
export {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  PostConditionSchema,
  RunPolicySchema,
  WorkflowIdSchema,
  WorkflowParamSchema,
  WorkflowSchema,
  WorkflowStepIdSchema,
  WorkflowStepSchema,
  WorkflowTargetSchema,
} from './schema';

export type { Migration } from './migration/migrate';
export { migrateToVersion } from './migration/migrate';
export { WORKFLOW_MIGRATIONS } from './migration/workflow-migrations';

export type { NewWorkflowInput, WorkflowPatch, WorkflowStore } from './store/workflow-store';
export { createWorkflowStore } from './store/workflow-store';

export { deriveSelector } from './recorder/derive-selector';
export type { RecordableStepInput } from './recorder/build-workflow-steps';
export { buildWorkflowSteps } from './recorder/build-workflow-steps';
export type { RunRecorder } from './recorder/run-recorder';
export { createRunRecorder } from './recorder/run-recorder';

export { findParamPlaceholderNames, toParamPlaceholder } from './params/param-placeholder';
export { mapStringsDeep } from './params/map-strings-deep';
export type { ParameterizeSecretInput, ParameterizeValueInput } from './params/parameterize';
export { parameterizeSecret, parameterizeValue } from './params/parameterize';
export { resolveWorkflowParams, validateWorkflowParams } from './params/resolve-params';

export type { WorkflowExecutionErrorCode } from './executor/executor-error';
export { WorkflowExecutionError } from './executor/executor-error';
export { resolveStepTarget } from './executor/resolve-target';
export { evaluatePostCondition } from './executor/evaluate-post-condition';
export type {
  NeedsHealingReason,
  NeedsHealingSignal,
  WorkflowRunOutcome,
  WorkflowStepResult,
} from './executor/execute-workflow';
export { executeWorkflow } from './executor/execute-workflow';
export { runWorkflow } from './executor/run-workflow';

export type { HealDiff, HealStepSnapshot } from './heal/heal-diff';
export { buildHealDiff } from './heal/heal-diff';
export type { HealGateDecision, HealGateInput, RunMode } from './heal/heal-gate';
export { gateHeal } from './heal/heal-gate';
export type {
  HealedStep,
  HealOutcome,
  HealStepDeps,
  HealStepInput,
  PendingHeal,
} from './heal/heal-step';
export { applyConfirmedHeal, healStep } from './heal/heal-step';
export { rollbackHealedStep } from './heal/rollback';
export type {
  HardStoppedRunOutcome,
  HealingRunOutcome,
  NeedsConfirmationRunOutcome,
  RunWithHealingDeps,
} from './heal/run-workflow-with-healing';
export { runWorkflowWithHealing } from './heal/run-workflow-with-healing';

export type { RunRecordStatus, WorkflowRunRecord } from './background/run-record';
export {
  RunRecordIdSchema,
  RunRecordStatusSchema,
  WorkflowRunRecordSchema,
} from './background/run-record';
export type {
  NewRunRecordInput,
  RunRecordPatch,
  WorkflowRunStore,
} from './background/run-record-store';
export { createWorkflowRunStore } from './background/run-record-store';
export type { RunConcurrencyLimiter } from './background/run-concurrency';
export { createRunConcurrencyLimiter } from './background/run-concurrency';
export type { BackgroundRunDeps } from './background/run-workflow-in-background';
export { runWorkflowInBackground } from './background/run-workflow-in-background';
