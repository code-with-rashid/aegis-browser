import {
  createWorkflowHealResponder,
  FIXTURES_DIR,
  launchExtension,
  seedModelRoutingConfig,
  seedWorkflows,
  startFakeModelServer,
  startStaticServer,
  waitForWorkflowRuns,
  workflowHealSeed,
  WORKFLOW_HEAL_FIXTURE_V1,
  WORKFLOW_HEAL_FIXTURE_V2,
  type FakeModelResponder,
} from '@aegis/eval-harness';
import type { BrowserContext, Worker } from 'playwright';

import type { WorkflowHealEvalResult, WorkflowRunOutcome } from './workflow-scorer';

const DEFAULT_TIMEOUT_MS = 30_000;
const CLEAN_WORKFLOW_ID = 'workflow-heal-eval-clean';
const CLEAN_WORKFLOW_NAME = 'Order availability (clean replay)';
const HEALED_WORKFLOW_ID = 'workflow-heal-eval-healed';
const HEALED_WORKFLOW_NAME = 'Order availability (healed replay)';

/** Wraps a responder with an external call counter — a deterministic replay's own "how many model calls did that take" is exactly the metric #120 asks to measure. */
function countingResponder(responder: FakeModelResponder): {
  readonly responder: FakeModelResponder;
  readonly count: () => number;
} {
  let count = 0;
  return {
    responder: (systemPrompt, userPrompt, callIndex) => {
      count += 1;
      return responder(systemPrompt, userPrompt, callIndex);
    },
    count: () => count,
  };
}

function toOutcome(status: string | undefined): WorkflowRunOutcome {
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'hard_stopped') {
    return 'hard_stopped';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return 'timeout';
}

/**
 * Triggers a workflow's background run through the real options-page "Run" action
 * (#118/#119), then observes the outcome by polling `chrome.storage.local` directly
 * (`waitForWorkflowRuns`) rather than any rendered UI — the options page's History view is
 * an on-demand, click-to-refresh feature, not a live dashboard, and a background run has
 * no UI open at all in production; reading the same storage a real scheduled run would
 * leave behind is the more faithful signal to observe.
 */
async function triggerAndWait(
  context: BrowserContext,
  extensionId: string,
  worker: Worker,
  workflowId: string,
  workflowName: string,
  timeoutMs: number,
): Promise<WorkflowRunOutcome> {
  const optionsPage = await context.newPage();
  try {
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.getByRole('button', { name: 'Workflows' }).click();
    const row = optionsPage.locator('li', { hasText: workflowName });
    await row.getByRole('button', { name: 'Run' }).click();
    await row.getByRole('button', { name: 'Start run' }).click();

    const runs = await waitForWorkflowRuns(
      worker,
      (snapshot) =>
        Object.values(snapshot).some(
          (run) => run.workflowId === workflowId && run.status !== 'running',
        ),
      timeoutMs,
    );
    const record = Object.values(runs).find((run) => run.workflowId === workflowId);
    return toOutcome(record?.status);
  } finally {
    await optionsPage.close();
  }
}

export interface RunWorkflowHealEvalOptions {
  readonly extensionPath: string;
  readonly timeoutMs?: number;
}

/**
 * Proves #113's self-heal claim end-to-end through the real background run engine (#115)
 * and the real options-page "Run" action (#118/#119) — not a unit-level fake CDP, the way
 * `packages/workflows`' own tests do. Phase 1 replays a recorded workflow against the
 * exact page it was recorded on: zero model calls, since a deterministic replay never
 * plans at all (#111). Phase 2 replays the *same* recorded step against a page that
 * changed since recording (#120's "simulated site change" — the button's id changed but
 * its accessible name didn't) — self-heal (#113) recovers it with exactly one targeted
 * Navigator call, never a full multi-step re-plan the way a live agent-loop retry would.
 * The two phases run sequentially against one extension instance: the background run
 * engine caps concurrent runs at 1 (`background.ts`), so triggering both at once would
 * just queue the second behind the first.
 */
export async function runWorkflowHealEval(
  options: RunWorkflowHealEvalOptions,
): Promise<WorkflowHealEvalResult> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staticServer = await startStaticServer(FIXTURES_DIR);
  const counting = countingResponder(createWorkflowHealResponder());
  const modelServer = await startFakeModelServer(counting.responder);
  const extension = await launchExtension(options.extensionPath);

  try {
    await seedModelRoutingConfig(extension.serviceWorker, modelServer.baseUrl);
    await seedWorkflows(extension.serviceWorker, [
      workflowHealSeed(
        CLEAN_WORKFLOW_ID,
        CLEAN_WORKFLOW_NAME,
        `${staticServer.baseUrl}/${WORKFLOW_HEAL_FIXTURE_V1}`,
      ),
      workflowHealSeed(
        HEALED_WORKFLOW_ID,
        HEALED_WORKFLOW_NAME,
        `${staticServer.baseUrl}/${WORKFLOW_HEAL_FIXTURE_V2}`,
      ),
    ]);

    const beforeClean = counting.count();
    const cleanReplayOutcome = await triggerAndWait(
      extension.context,
      extension.extensionId,
      extension.serviceWorker,
      CLEAN_WORKFLOW_ID,
      CLEAN_WORKFLOW_NAME,
      timeoutMs,
    );
    const cleanReplayCallCount = counting.count() - beforeClean;

    const beforeHealed = counting.count();
    const healedReplayOutcome = await triggerAndWait(
      extension.context,
      extension.extensionId,
      extension.serviceWorker,
      HEALED_WORKFLOW_ID,
      HEALED_WORKFLOW_NAME,
      timeoutMs,
    );
    const healedReplayCallCount = counting.count() - beforeHealed;

    return {
      cleanReplayOutcome,
      cleanReplayCallCount,
      healedReplayOutcome,
      healedReplayCallCount,
      durationMs: Date.now() - startedAt,
    };
  } catch (cause) {
    return {
      cleanReplayOutcome: 'failed',
      cleanReplayCallCount: 0,
      healedReplayOutcome: 'failed',
      healedReplayCallCount: 0,
      durationMs: Date.now() - startedAt,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    await extension.close();
    await modelServer.close();
    await staticServer.close();
  }
}
