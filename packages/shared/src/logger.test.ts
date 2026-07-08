import { describe, expect, it, vi } from 'vitest';

import { createLogger } from './logger';

function createFakeSink() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('logger', () => {
  it('prefixes messages with the scope', () => {
    const sink = createFakeSink();
    const logger = createLogger('background', sink);

    logger.info('started');

    expect(sink.info).toHaveBeenCalledTimes(1);
    const [line] = sink.info.mock.calls[0] as [string];
    expect(line).toContain('[background] started');
  });

  it('passes structured fields through as a second argument', () => {
    const sink = createFakeSink();
    const logger = createLogger('agent', sink);

    logger.error('step failed', { step: 3 });

    expect(sink.error).toHaveBeenCalledWith(expect.stringContaining('step failed'), { step: 3 });
  });

  it('child() nests the scope under a colon', () => {
    const sink = createFakeSink();
    const logger = createLogger('background', sink).child('planner');

    logger.warn('retrying');

    const [line] = sink.warn.mock.calls[0] as [string];
    expect(line).toContain('[background:planner] retrying');
  });

  it('routes each level to the matching sink method', () => {
    const sink = createFakeSink();
    const logger = createLogger('x', sink);

    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');

    expect(sink.debug).toHaveBeenCalledTimes(1);
    expect(sink.info).toHaveBeenCalledTimes(1);
    expect(sink.warn).toHaveBeenCalledTimes(1);
    expect(sink.error).toHaveBeenCalledTimes(1);
  });
});
