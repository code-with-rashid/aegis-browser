import {
  FIXTURES_DIR,
  launchExtension,
  seedModelRoutingConfig,
  startFakeModelServer,
  startStaticServer,
  type FakeModelServerHandle,
} from '@aegis/eval-harness';
import type { ProviderConfig } from '@aegis/llm';
import type { Page } from 'playwright';

import { seedLiveProviderConfig } from './seed-live-chrome-storage';
import type { TaskOutcome, TaskRunResult } from './scorer';
import type { EvalTask } from './task-set';

export type EvalMode =
  { readonly kind: 'mock' } | { readonly kind: 'live'; readonly provider: ProviderConfig };

const DEFAULT_MOCK_TIMEOUT_MS = 30_000;
const DEFAULT_LIVE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;

function parseOutcome(text: string): TaskOutcome {
  if (text.includes('Failed')) {
    return 'failed';
  }
  if (text.includes('Stopped')) {
    return 'stopped';
  }
  if (text.includes('Done')) {
    return 'done';
  }
  return 'timeout';
}

function parseSteps(text: string): { stepCount: number; replanCount: number } {
  const match = /Steps:\s*(\d+)\s*·\s*Replans:\s*(\d+)/.exec(text);
  return {
    stepCount: match?.[1] !== undefined ? Number(match[1]) : 0,
    replanCount: match?.[2] !== undefined ? Number(match[2]) : 0,
  };
}

/** Polls the side panel's full text until a terminal status word appears, or `timeoutMs` elapses. */
async function waitForOutcomeText(page: Page, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const text = await page.evaluate(() => document.body.innerText);
    if (/\b(Done|Failed|Stopped)\b/.test(text) || Date.now() >= deadline) {
      return text;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export interface RunTaskOptions {
  /** Path to the built `.output/chrome-mv3`-shaped extension directory. */
  readonly extensionPath: string;
  readonly mode: EvalMode;
  readonly timeoutMs?: number;
}

/**
 * Runs one {@link EvalTask} against the real built extension (mock mode: the same fake
 * local model server the E2E specs use; live mode: a real, caller-configured provider)
 * and reports what actually happened — no assertions, since this is a scoring tool, not
 * a test.
 */
export async function runTask(task: EvalTask, options: RunTaskOptions): Promise<TaskRunResult> {
  const startedAt = Date.now();
  const staticServer = await startStaticServer(FIXTURES_DIR);
  let fakeServer: FakeModelServerHandle | undefined;
  const extension = await launchExtension(options.extensionPath);

  try {
    if (options.mode.kind === 'mock') {
      fakeServer = await startFakeModelServer(task.createResponder());
      await seedModelRoutingConfig(extension.serviceWorker, fakeServer.baseUrl);
    } else {
      await seedLiveProviderConfig(extension.serviceWorker, options.mode.provider);
    }

    const fixturePage = await extension.context.newPage();
    await fixturePage.goto(`${staticServer.baseUrl}/${task.fixture}`);

    const sidePanelPage = await extension.context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extension.extensionId}/sidepanel.html`);

    // See `apps/extension/e2e/read-only-use-cases.spec.ts` — `chrome.tabs.query({active:
    // true})` must resolve to the fixture tab, not the side-panel-loaded-as-a-tab itself.
    await fixturePage.bringToFront();

    await sidePanelPage.getByPlaceholder('What should Aegis do?').fill(task.task);
    await sidePanelPage.getByRole('button', { name: 'Start' }).click();

    const timeoutMs =
      options.timeoutMs ??
      (options.mode.kind === 'live' ? DEFAULT_LIVE_TIMEOUT_MS : DEFAULT_MOCK_TIMEOUT_MS);
    const text = await waitForOutcomeText(sidePanelPage, timeoutMs);
    const { stepCount, replanCount } = parseSteps(text);

    return {
      taskId: task.id,
      outcome: parseOutcome(text),
      summaryMatched: text.includes(task.expectedSummaryContains),
      stepCount,
      replanCount,
      durationMs: Date.now() - startedAt,
    };
  } catch (cause) {
    return {
      taskId: task.id,
      outcome: 'failed',
      summaryMatched: false,
      stepCount: 0,
      replanCount: 0,
      durationMs: Date.now() - startedAt,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    await extension.close();
    await fakeServer?.close();
    await staticServer.close();
  }
}

/** Runs every task in {@link EvalTask}[] serially — one real browser at a time, matching how the E2E specs run. */
export async function runTaskSet(
  tasks: readonly EvalTask[],
  options: RunTaskOptions,
): Promise<TaskRunResult[]> {
  const results: TaskRunResult[] = [];
  for (const task of tasks) {
    results.push(await runTask(task, options));
  }
  return results;
}
