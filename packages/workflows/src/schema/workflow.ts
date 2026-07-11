import { z } from 'zod';

import { toWorkflowId, toWorkflowStepId } from '../ids';
import { PostConditionSchema } from './post-condition';
import { WorkflowParamSchema } from './param';
import { RunPolicySchema } from './run-policy';
import { WorkflowTargetSchema } from './target';

/** Validates a raw string and brands it as a {@link WorkflowId}. */
export const WorkflowIdSchema = z.string().min(1).transform(toWorkflowId);

/** Validates a raw string and brands it as a {@link WorkflowStepId}. */
export const WorkflowStepIdSchema = z.string().min(1).transform(toWorkflowStepId);

/**
 * One recorded step (#109): the tool call the recorded run made, plus enough to replay it
 * deterministically (`target`) and to tell whether the replay actually worked
 * (`expect`) — both optional since not every tool call targets a page element or has a
 * checkable post-condition (e.g. a `wait`, or an MCP tool call).
 */
export const WorkflowStepSchema = z.object({
  stepId: WorkflowStepIdSchema,
  toolId: z.string().min(1),
  args: z.unknown(),
  target: WorkflowTargetSchema.optional(),
  expect: PostConditionSchema.optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

/**
 * Bump whenever `WorkflowSchema`'s *shape* changes in a way old persisted data wouldn't
 * satisfy — distinct from `Workflow.version`, which is the individual workflow's own
 * revision counter (bumped on every edit/heal, `#113`/`#119`). A `WorkflowStore` migrates
 * a persisted envelope up to this version before ever validating against the current
 * schema (`../migration`).
 */
export const CURRENT_WORKFLOW_SCHEMA_VERSION = 1;

/**
 * A versioned, parameterized, replayable sequence of steps captured from a successful
 * agent run (`docs/adr/0042-workflow-data-model-storage.md`). `origin` is the site it
 * runs against — a `RunPolicy` origin/tool allow-list is meaningless without knowing what
 * origin a workflow is even scoped to.
 */
export const WorkflowSchema = z.object({
  id: WorkflowIdSchema,
  version: z.number().int().nonnegative(),
  name: z.string().min(1),
  origin: z.string().min(1),
  params: z.array(WorkflowParamSchema).default([]),
  steps: z.array(WorkflowStepSchema),
  authorization: RunPolicySchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Workflow = z.infer<typeof WorkflowSchema>;
