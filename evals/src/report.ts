import type { EvalReport, TaskScore } from './scorer';

function formatScoreLine(score: TaskScore): string {
  const mark = score.passed ? 'PASS' : 'FAIL';
  const detail = [
    `outcome=${score.outcome}`,
    `steps=${score.stepCount}`,
    `replans=${score.replanCount}`,
    `duration=${score.durationMs}ms`,
  ];
  if (score.error !== undefined) {
    detail.push(`error=${score.error}`);
  }
  return `[${mark}] ${score.taskId} — ${detail.join(' ')}`;
}

/** A human-readable report for the console; `pnpm eval`'s primary output. */
export function formatReport(report: EvalReport): string {
  const lines: string[] = [
    `Aegis reliability eval — task set v${report.version}`,
    '',
    ...report.scores.map(formatScoreLine),
    '',
    `${report.passedCount}/${report.totalCount} tasks passed`,
  ];
  return lines.join('\n');
}
