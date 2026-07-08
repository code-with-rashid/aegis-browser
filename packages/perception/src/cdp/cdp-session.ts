import type { ProtocolMapping } from 'devtools-protocol/types/protocol-mapping';

import { AegisError, type Result } from '@aegis/shared';

/** Discriminates why a {@link CdpSession} operation failed. */
export type CdpErrorCode =
  'CDP_ATTACH_FAILED' | 'CDP_DETACH_FAILED' | 'CDP_SEND_FAILED' | 'CDP_NOT_ATTACHED';

/** Typed error raised by a {@link CdpSession} operation. */
export class CdpError extends AegisError {
  readonly code: CdpErrorCode;

  constructor(code: CdpErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/**
 * A safe lifecycle over one tab's Chrome DevTools Protocol connection. Commands and
 * events are typed against the full CDP spec via `devtools-protocol`'s `ProtocolMapping`.
 */
export interface CdpSession {
  readonly tabId: number;
  readonly isAttached: boolean;

  attach(): Promise<Result<void, CdpError>>;
  detach(): Promise<Result<void, CdpError>>;

  send<M extends keyof ProtocolMapping.Commands>(
    method: M,
    params?: ProtocolMapping.Commands[M]['paramsType'][0],
  ): Promise<Result<ProtocolMapping.Commands[M]['returnType'], CdpError>>;

  /** Subscribes to a CDP event, returning an unsubscribe function. */
  on<E extends keyof ProtocolMapping.Events>(
    event: E,
    handler: (params: ProtocolMapping.Events[E][0]) => void,
  ): () => void;
}
