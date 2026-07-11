import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCliArgs, resolveLiveProviderConfig } from './cli-args';
import { buildReport } from './scorer';
import { formatReport } from './report';
import { runTaskSet, type EvalMode } from './runner';
import { TASK_SET, TASK_SET_VERSION } from './task-set';
import { runWorkflowHealEval } from './workflow-runner';
import { formatWorkflowReport } from './workflow-report';
import { scoreWorkflowHealEval } from './workflow-scorer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, '../../apps/extension/.output/chrome-mv3');

function resolveMode(): EvalMode {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.mode === 'live') {
    return { kind: 'live', provider: resolveLiveProviderConfig(args) };
  }
  return { kind: 'mock' };
}

async function main(): Promise<void> {
  const mode = resolveMode();

  console.log(
    `Running the Aegis reliability eval (task set v${TASK_SET_VERSION}, mode=${mode.kind})...`,
  );
  const results = await runTaskSet(TASK_SET, { extensionPath: EXTENSION_PATH, mode });
  const report = buildReport(TASK_SET_VERSION, results);

  console.log('');
  console.log(formatReport(report));

  // Mock-only (#120): the workflow eval's pass criteria are exact model-call counts
  // against a scripted responder — meaningless against a real, nondeterministic provider,
  // the same reason live mode is a manual, local-only invocation (never wired into CI).
  console.log('');
  const workflowResult = await runWorkflowHealEval({ extensionPath: EXTENSION_PATH });
  const workflowScore = scoreWorkflowHealEval(workflowResult);
  console.log(formatWorkflowReport(workflowScore));

  if (report.passedCount < report.totalCount || !workflowScore.passed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
