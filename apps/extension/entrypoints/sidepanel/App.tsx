import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ConfirmationModal } from './confirmation-modal';
import { useRunStore } from './store';
import { TraceList } from './trace-list';

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  active: 'Running',
  paused: 'Paused',
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
};

export default function App(): React.JSX.Element {
  const status = useRunStore((s) => s.status);
  const task = useRunStore((s) => s.task);
  const stepCount = useRunStore((s) => s.stepCount);
  const replanCount = useRunStore((s) => s.replanCount);
  const taskSummary = useRunStore((s) => s.taskSummary);
  const lastError = useRunStore((s) => s.lastError);
  const startFailedReason = useRunStore((s) => s.startFailedReason);
  const trace = useRunStore((s) => s.trace);
  const pendingConfirmation = useRunStore((s) => s.pendingConfirmation);
  const setTask = useRunStore((s) => s.setTask);
  const startRun = useRunStore((s) => s.startRun);
  const stopRun = useRunStore((s) => s.stopRun);
  const pauseRun = useRunStore((s) => s.pauseRun);
  const resumeRun = useRunStore((s) => s.resumeRun);
  const approveConfirmation = useRunStore((s) => s.approveConfirmation);
  const rejectConfirmation = useRunStore((s) => s.rejectConfirmation);
  const editConfirmation = useRunStore((s) => s.editConfirmation);

  const [tabLookupError, setTabLookupError] = useState<string | undefined>(undefined);

  const canStart =
    status === 'idle' || status === 'done' || status === 'failed' || status === 'stopped';
  const isRunning = status === 'active';
  const isPaused = status === 'paused';

  function handleStart(): void {
    setTabLookupError(undefined);
    activeTabId()
      .then((tabId) => {
        if (tabId === undefined) {
          setTabLookupError('No active tab found — open a page first.');
          return;
        }
        startRun(tabId);
      })
      .catch(() => {
        setTabLookupError('Could not read the active tab.');
      });
  }

  return (
    <div className="flex h-full min-h-[400px] w-[360px] flex-col gap-3 overflow-y-auto bg-background p-4 text-foreground">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Aegis</h1>
        <p className="text-sm text-muted-foreground">Local-first, BYOK browser automation.</p>
      </header>

      <textarea
        className="min-h-[80px] resize-none rounded-md border border-border bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        placeholder="What should Aegis do?"
        value={task}
        onChange={(event) => {
          setTask(event.target.value);
        }}
        disabled={!canStart}
      />

      <div className="flex gap-2">
        {canStart ? (
          <Button onClick={handleStart} disabled={task.trim().length === 0}>
            Start
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={stopRun}>
              Stop
            </Button>
            {isPaused ? (
              <Button variant="secondary" onClick={resumeRun}>
                Resume
              </Button>
            ) : (
              <Button variant="secondary" onClick={pauseRun} disabled={!isRunning}>
                Pause
              </Button>
            )}
          </>
        )}
      </div>

      {tabLookupError !== undefined ? (
        <p className="text-sm text-red-600">{tabLookupError}</p>
      ) : null}
      {startFailedReason !== undefined ? (
        <p className="text-sm text-red-600">{startFailedReason}</p>
      ) : null}

      <div className="mt-2 space-y-1 rounded-md border border-border p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">Status</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              status === 'failed' && 'bg-red-100 text-red-700',
              status === 'done' && 'bg-green-100 text-green-700',
              (status === 'active' || status === 'paused') && 'bg-blue-100 text-blue-700',
              (status === 'idle' || status === 'stopped') && 'bg-muted text-muted-foreground',
            )}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
        <p className="text-muted-foreground">
          Steps: {stepCount} · Replans: {replanCount}
        </p>
        {taskSummary !== undefined ? <p>{taskSummary}</p> : null}
        {lastError !== undefined ? (
          <p className="text-red-600">
            {lastError.code}: {lastError.message}
          </p>
        ) : null}
      </div>

      <TraceList steps={trace} />

      {pendingConfirmation !== undefined ? (
        <ConfirmationModal
          request={pendingConfirmation}
          onApprove={approveConfirmation}
          onReject={rejectConfirmation}
          onEdit={editConfirmation}
        />
      ) : null}
    </div>
  );
}
