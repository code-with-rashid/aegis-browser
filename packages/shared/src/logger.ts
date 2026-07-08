/** Severity of a single log entry. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured metadata attached to a log entry, printed alongside the message. */
export type LogFields = Readonly<Record<string, unknown>>;

/** A scoped structured logger. Use {@link Logger.child} to nest scopes (e.g. `agent:planner`). */
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(scope: string): Logger;
}

/** The subset of the `console` API the logger writes to. Swappable for tests. */
export interface LogSink {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

class ScopedLogger implements Logger {
  constructor(
    private readonly scope: string,
    private readonly sink: LogSink,
  ) {}

  debug(message: string, fields?: LogFields): void {
    this.write('debug', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.write('error', message, fields);
  }

  child(scope: string): Logger {
    return new ScopedLogger(`${this.scope}:${scope}`, this.sink);
  }

  private write(level: LogLevel, message: string, fields?: LogFields): void {
    const line = `[${new Date().toISOString()}] [${this.scope}] ${message}`;
    if (fields === undefined) {
      this.sink[level](line);
    } else {
      this.sink[level](line, fields);
    }
  }
}

/** Creates a {@link Logger} scoped to `scope`, writing to `sink` (defaults to `console`). */
export function createLogger(scope: string, sink: LogSink = console): Logger {
  return new ScopedLogger(scope, sink);
}
