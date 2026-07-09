export type { AgentErrorCode } from './loop/errors';
export { AgentError } from './loop/errors';

export type {
  LoopServices,
  PerceiveInput,
  PerceiveService,
  PlanInput,
  PlanOutput,
  PlannerService,
  DecideInput,
  DecideOutput,
  NavigatorService,
  PolicyCheckInput,
  PolicyCheckOutput,
  PolicyDecision,
  PolicyService,
  CriticCheckInput,
  CriticCheckOutput,
  CriticService,
  ActService,
  VerifyInput,
  VerifyOutput,
  VerifyOutcome,
  VerifierService,
} from './loop/services';

export type { ActionOutcomeSummary, RunSummary } from './loop/run-summary';
export { summarizeRunOutcome } from './loop/run-summary';

export type {
  AgentLoopInput,
  AgentLoopContext,
  AgentLoopEvent,
  LoopErrorSummary,
} from './loop/machine';
export { createAgentLoopMachine, DEFAULT_MAX_STEPS, DEFAULT_MAX_REPLANS } from './loop/machine';

export type { ConfirmationRequest } from './loop/confirmation';
export { buildConfirmationRequest, describeAction } from './loop/confirmation';

export type { PersistableActor } from './loop/persistence';
export {
  persistAgentLoopOnTransition,
  hydrateAgentLoopSnapshot,
  clearAgentLoopSnapshot,
} from './loop/persistence';

export type { LoopControlHandle } from './loop/controls';
export {
  stopLoop,
  pauseLoop,
  resumeLoop,
  approveLoop,
  rejectLoop,
  editLoop,
} from './loop/controls';

export type { LoopRunOutcome, LoopRunSummary, LoopSnapshotLike } from './loop/summary';
export { summarizeLoopRun } from './loop/summary';

export type { TraceActionEntry, TraceStep } from './loop/trace';
export { buildTraceStep } from './loop/trace';

export type { SanitizeText } from './sanitize';
export { identitySanitize, wrapUntrustedContent } from './sanitize';

export type { PlannerLlmOutput } from './planner/schema';
export { PlannerOutputSchema } from './planner/schema';
export type { BuildPlannerPromptOptions } from './planner/prompt';
export { PLANNER_SYSTEM_PROMPT, buildPlannerPrompt } from './planner/prompt';
export type { CreatePlannerServiceOptions } from './planner/create-planner-service';
export { createPlannerService } from './planner/create-planner-service';

export type { NavigatorLlmOutput } from './navigator/schema';
export { NavigatorOutputSchema } from './navigator/schema';
export type { BuildNavigatorPromptOptions } from './navigator/prompt';
export { NAVIGATOR_SYSTEM_PROMPT, buildNavigatorPrompt } from './navigator/prompt';
export { findHallucinatedRefs } from './navigator/hallucinated-refs';
export type { CreateNavigatorServiceOptions } from './navigator/create-navigator-service';
export { createNavigatorService } from './navigator/create-navigator-service';

export type { VerifierLlmOutput } from './verifier/schema';
export { VerifierOutputSchema } from './verifier/schema';
export type { BuildVerifierPromptOptions } from './verifier/prompt';
export { VERIFIER_SYSTEM_PROMPT, buildVerifierPrompt } from './verifier/prompt';
export type { CreateVerifierServiceOptions } from './verifier/create-verifier-service';
export { createVerifierService } from './verifier/create-verifier-service';

export type { CriticLlmOutput } from './critic/schema';
export { CriticOutputSchema } from './critic/schema';
export type { BuildCriticPromptOptions } from './critic/prompt';
export { CRITIC_SYSTEM_PROMPT, buildCriticPrompt } from './critic/prompt';
export type { CreateCriticServiceOptions } from './critic/create-critic-service';
export { createCriticService } from './critic/create-critic-service';
