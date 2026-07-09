import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type BrowserContext, type Worker } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, '../.output/chrome-mv3');

export interface ExtensionHandle {
  readonly context: BrowserContext;
  readonly extensionId: string;
  readonly serviceWorker: Worker;
  close(): Promise<void>;
}

/**
 * Loads the real, built MV3 extension (`.output/chrome-mv3` — run `pnpm build` first)
 * into a headed, persistent Chromium context. Unpacked extension loading and
 * `chrome.debugger` both need a real browser window, not the headless shell, matching
 * #31's "CI headed mode" acceptance criterion.
 */
export async function launchExtension(): Promise<ExtensionHandle> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'aegis-e2e-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
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
