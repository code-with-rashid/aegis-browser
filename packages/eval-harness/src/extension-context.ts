import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chromium, type BrowserContext, type Worker } from 'playwright';

export interface ExtensionHandle {
  readonly context: BrowserContext;
  readonly extensionId: string;
  readonly serviceWorker: Worker;
  close(): Promise<void>;
}

/**
 * Loads a real, built MV3 extension (an `.output/chrome-mv3`-shaped directory — run
 * `pnpm build` first) into a headed, persistent Chromium context. Unpacked extension
 * loading and `chrome.debugger` both need a real browser window, not the headless shell —
 * shared by `apps/extension`'s Playwright E2E specs (#31) and `evals/`'s reliability
 * runner (#33), which both need to drive the real running extension.
 */
export async function launchExtension(extensionPath: string): Promise<ExtensionHandle> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'aegis-eval-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  let worker: Worker | undefined = context.serviceWorkers()[0];
  worker ??= await context.waitForEvent('serviceworker', { timeout: 30_000 });

  const extensionId = new URL(worker.url()).hostname;

  return {
    context,
    extensionId,
    serviceWorker: worker,
    close: () => context.close(),
  };
}
