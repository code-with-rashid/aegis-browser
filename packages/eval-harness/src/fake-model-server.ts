import { createServer, type Server } from 'node:http';

export interface FakeModelServerHandle {
  readonly baseUrl: string;
  close(): Promise<void>;
}

/**
 * Returns the scripted JSON text for the `callIndex`-th call made under `systemPrompt`
 * (0-based, per distinct system prompt) — the fake model's entire "brain" for one
 * scenario.
 */
export type FakeModelResponder = (
  systemPrompt: string,
  userPrompt: string,
  callIndex: number,
) => string;

function contentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) =>
        typeof part === 'object' && part !== null && 'text' in part ? String(part.text) : '',
      )
      .join('');
  }
  return '';
}

/**
 * A minimal local HTTP server implementing just enough of the OpenAI chat-completions
 * wire format (`POST /chat/completions`) for `@ai-sdk/openai-compatible` to parse a
 * response — the "mock/local model" standing in for a real provider so a scenario run is
 * deterministic and needs no API key. `respond` decides the scripted content per call;
 * this server only handles the transport plumbing (parsing `messages`, tracking a call
 * count per distinct system prompt, and writing back a schema-valid
 * `OpenAICompatibleChatResponseSchema` body).
 */
export function startFakeModelServer(respond: FakeModelResponder): Promise<FakeModelServerHandle> {
  const callCounts = new Map<string, number>();

  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(404).end();
        return;
      }

      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          const messages =
            typeof parsed === 'object' && parsed !== null && 'messages' in parsed
              ? parsed.messages
              : [];
          const messageList = Array.isArray(messages) ? messages : [];

          const systemMessage = messageList.find(
            (message: unknown) =>
              typeof message === 'object' &&
              message !== null &&
              (message as { role?: unknown }).role === 'system',
          ) as { content?: unknown } | undefined;
          const userMessages = messageList.filter(
            (message: unknown) =>
              typeof message === 'object' &&
              message !== null &&
              (message as { role?: unknown }).role === 'user',
          ) as { content?: unknown }[];
          const lastUserMessage = userMessages[userMessages.length - 1];

          const systemText = contentText(systemMessage?.content);
          const userText = contentText(lastUserMessage?.content);

          const key = systemText.slice(0, 60);
          const callIndex = callCounts.get(key) ?? 0;
          callCounts.set(key, callIndex + 1);

          const content = respond(systemText, userText, callIndex);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
            }),
          );
        } catch (cause) {
          res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(cause));
        }
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Fake model server failed to bind to a TCP port'));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
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
