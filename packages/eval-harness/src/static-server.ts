import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

export interface StaticServerHandle {
  readonly baseUrl: string;
  close(): Promise<void>;
}

/**
 * Serves the HTML files in `fixturesDir` over real HTTP — the agent navigates a
 * `chrome.tabs` tab to these, not a Playwright-controlled page, so they need a genuine
 * URL rather than a `file://` path.
 */
export function startStaticServer(fixturesDir: string): Promise<StaticServerHandle> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      const requestPath = (req.url ?? '/').split('?')[0] ?? '/';
      const filePath = path.join(fixturesDir, path.normalize(requestPath));
      if (!filePath.startsWith(fixturesDir)) {
        res.writeHead(403).end();
        return;
      }
      stat(filePath)
        .then((stats) => {
          if (!stats.isFile()) {
            res.writeHead(404).end();
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          createReadStream(filePath).pipe(res);
        })
        .catch(() => {
          res.writeHead(404).end();
        });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Static fixture server failed to bind to a TCP port'));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((res, rej) => {
            server.close((error) => {
              if (error) {
                rej(error);
              } else {
                res();
              }
            });
          }),
      });
    });
  });
}
