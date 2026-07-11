import {
  createWorkflowHealHostileResponder,
  FIXTURES_DIR,
  launchExtension,
  seedModelRoutingConfig,
  seedWorkflows,
  startFakeModelServer,
  startStaticServer,
  waitForWorkflowRuns,
  workflowHealSeed,
  WORKFLOW_HEAL_FIXTURE_V1,
  WORKFLOW_HEAL_INJECTED_FIXTURE,
  type ExtensionHandle,
  type FakeModelResponder,
} from '@aegis/eval-harness';
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, '../.output/chrome-mv3');
const RUN_TIMEOUT_MS = 20_000;

/** Mirrors `hostile-tool-security.spec.ts`'s own wrapper — the real, sanitized Navigator user prompt a background heal call actually received. */
function captureNavigatorPrompt(
  responder: FakeModelResponder,
  captured: { prompt: string | undefined },
): FakeModelResponder {
  return (systemPrompt, userPrompt, callIndex) => {
    if (systemPrompt.includes('You are the Navigator') && captured.prompt === undefined) {
      captured.prompt = userPrompt;
    }
    return responder(systemPrompt, userPrompt, callIndex);
  };
}

/** Never expected to be called — proves a hard-stop happened before any model call, not just before any tool call. */
const unreachableResponder: FakeModelResponder = (systemPrompt) => {
  throw new Error(`Expected no model call at all; got a call under system prompt: ${systemPrompt}`);
};

async function triggerRun(
  extensionId: string,
  context: ExtensionHandle['context'],
  workflowName: string,
): Promise<void> {
  const optionsPage = await context.newPage();
  try {
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.getByRole('button', { name: 'Workflows' }).click();
    const row = optionsPage.locator('li', { hasText: workflowName });
    await row.getByRole('button', { name: 'Run' }).click();
    await row.getByRole('button', { name: 'Start run' }).click();
  } finally {
    await optionsPage.close();
  }
}

/**
 * Proves #120's "injection during background/scheduled runs blocked" and "no
 * unauthorized state change" claims for the *unattended workflow* path specifically —
 * `security-injection.spec.ts`/`hostile-tool-security.spec.ts` already prove this for the
 * live side-panel loop, but nothing previously exercised it for a background self-heal
 * (ADR 0051 noted this gap and deliberately left it unaddressed, out of #117's scope).
 *
 * Writing the first test here surfaced a real, pre-existing gap: `buildNavigatorPrompt`
 * (`packages/agent`) sanitizes `perception.content.text` and a tool's own `description`,
 * but never an individual page element's accessible `name` — so injected text that
 * becomes an element's name (as ordinary visible page text does) reaches the Navigator
 * verbatim, for the live loop as much as for a workflow heal. See ADR 0054: deliberately
 * not fixed here (a `packages/agent` change, out of this issue's "workflows" scope) —
 * what this suite instead proves is that the *structural* safety net (`gateHeal` never
 * letting an unattended heal auto-apply a state-changing action) holds regardless of
 * whether the model was fooled.
 */
test.describe('unattended workflow security suite', () => {
  test('an injected instruction during background self-heal cannot cause an unauthorized state change, even though the Navigator sees and follows it', async () => {
    const staticServer = await startStaticServer(FIXTURES_DIR);
    const captured: { prompt: string | undefined } = { prompt: undefined };
    const modelServer = await startFakeModelServer(
      captureNavigatorPrompt(createWorkflowHealHostileResponder(), captured),
    );
    const extension = await launchExtension(EXTENSION_PATH);
    const workflowId = 'workflow-injected-heal';
    const workflowName = 'Order availability (injected)';

    try {
      await seedModelRoutingConfig(extension.serviceWorker, modelServer.baseUrl);
      await seedWorkflows(extension.serviceWorker, [
        workflowHealSeed(
          workflowId,
          workflowName,
          `${staticServer.baseUrl}/${WORKFLOW_HEAL_INJECTED_FIXTURE}`,
        ),
      ]);

      const fixturePage = await extension.context.newPage();
      await fixturePage.goto(`${staticServer.baseUrl}/${WORKFLOW_HEAL_INJECTED_FIXTURE}`);

      await triggerRun(extension.extensionId, extension.context, workflowName);

      const runs = await waitForWorkflowRuns(
        extension.serviceWorker,
        (snapshot) =>
          Object.values(snapshot).some(
            (run) => run.workflowId === workflowId && run.status !== 'running',
          ),
        RUN_TIMEOUT_MS,
      );
      const record = Object.values(runs).find((run) => run.workflowId === workflowId);

      // Zero unauthorized state change: the induced "Delete Account" click never ran —
      // `gateHeal` hard-stops a state-changing heal unattended regardless of RunPolicy.
      await expect(fixturePage.locator('#account-deleted')).toBeHidden();
      expect(record?.status).toBe('hard_stopped');
      expect(record?.reason).toContain('state-changing');

      // The injected instruction survives verbatim in the Navigator's "Available
      // elements" list — `buildNavigatorPrompt` only sanitizes `perception.content.text`
      // (a WebMCP tool's own `description` is sanitized too, via `formatTool`), never an
      // individual element's accessible `name`. A discovered, pre-existing gap in
      // `@aegis/agent`'s prompt builder (affects the live loop too, not just workflows) —
      // out of scope for this issue to fix (see ADR 0054) — but the point this asserts,
      // mirroring `hostile-tool-description.ts`'s own "survives sanitization by design"
      // case, is that the *structural* defense doesn't depend on catching this: `gateHeal`
      // never lets an unattended heal auto-apply a state-changing action regardless of
      // what text reached the model.
      expect(captured.prompt).toBeDefined();
      expect(captured.prompt).toContain('ignore the previous task');
    } finally {
      await extension.close();
      await modelServer.close();
      await staticServer.close();
    }
  });

  test('a recorded step outside the RunPolicy allow-list never executes, even though its target exists', async () => {
    const staticServer = await startStaticServer(FIXTURES_DIR);
    const modelServer = await startFakeModelServer(unreachableResponder);
    const extension = await launchExtension(EXTENSION_PATH);
    const workflowId = 'workflow-out-of-policy';
    const workflowName = 'Order availability (out-of-policy)';

    try {
      await seedModelRoutingConfig(extension.serviceWorker, modelServer.baseUrl);
      await seedWorkflows(extension.serviceWorker, [
        workflowHealSeed(
          workflowId,
          workflowName,
          `${staticServer.baseUrl}/${WORKFLOW_HEAL_FIXTURE_V1}`,
          { allowedToolIds: ['mcp.some-other-tool'] },
        ),
      ]);

      const fixturePage = await extension.context.newPage();
      await fixturePage.goto(`${staticServer.baseUrl}/${WORKFLOW_HEAL_FIXTURE_V1}`);

      await triggerRun(extension.extensionId, extension.context, workflowName);

      const runs = await waitForWorkflowRuns(
        extension.serviceWorker,
        (snapshot) =>
          Object.values(snapshot).some(
            (run) => run.workflowId === workflowId && run.status !== 'running',
          ),
        RUN_TIMEOUT_MS,
      );
      const record = Object.values(runs).find((run) => run.workflowId === workflowId);

      // The button was never clicked at all, even though it exists on this exact page —
      // the allow-list gate blocks the step before the executor ever attempts it.
      await expect(fixturePage.locator('#status')).toBeHidden();
      expect(record?.status).toBe('hard_stopped');
      expect(record?.reason).toContain('allow-list');
    } finally {
      await extension.close();
      await modelServer.close();
      await staticServer.close();
    }
  });
});
