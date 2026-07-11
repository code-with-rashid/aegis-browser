import type { Migration } from './migrate';

/**
 * Every migration needed to bring a persisted `Workflow` envelope up to
 * `CURRENT_WORKFLOW_SCHEMA_VERSION`. Empty today — `WorkflowSchema` has only ever had one
 * shape (version 1) — populate this the day a real schema change needs one.
 */
export const WORKFLOW_MIGRATIONS: readonly Migration[] = [];
