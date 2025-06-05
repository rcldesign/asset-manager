import { config } from '../config';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

class Logger {
  private levels: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  private currentLevel: number;

  constructor() {
    this.currentLevel = this.levels[config.logging.level];
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (this.levels[level] <= this.currentLevel) {
      const entry: LogEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      };

      const output = config.isDevelopment
        ? `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`
        : JSON.stringify(entry);

      if (level === 'error') {
        console.error(output);
      } else if (level === 'warn') {
        console.warn(output);
      } else {
        console.log(output);
      }
    }
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.log('error', message, {
      ...meta,
      ...(error instanceof Error && {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      }),
    });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }
}

export const logger = new Logger();
