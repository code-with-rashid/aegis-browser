import type { WorkflowHealEvalScore } from './workflow-scorer';

/** A human-readable report for the console — the workflow-eval analog of `report.ts`'s `formatReport`. */
export function formatWorkflowReport(score: WorkflowHealEvalScore): string {
  const mark = score.passed ? 'PASS' : 'FAIL';
  const lines: string[] = [
    'Workflow self-heal eval',
    '',
    `  clean replay:  outcome=${score.cleanReplayOutcome} modelCalls=${score.cleanReplayCallCount}`,
    `  healed replay: outcome=${score.healedReplayOutcome} modelCalls=${score.healedReplayCallCount} healed=${score.healSucceeded}`,
    `  duration=${score.durationMs}ms`,
  ];
  if (score.error !== undefined) {
    lines.push(`  error=${score.error}`);
  }
  lines.push('', `[${mark}] workflow-self-heal`);
  return lines.join('\n');
}
