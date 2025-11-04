// CHANGE: Implement structured logger with INFO/DEBUG/ERROR levels.
// WHY: Logging invariants ensure observability for HTTP/cache flows.
// QUOTE(TЗ): "Логи: INFO (сводка), DEBUG (детали HTTP/кеша), ERROR (исключения)."
// REF: REQ-9
// SOURCE: internal reasoning

import chalk from "chalk";

type LogLevel = "debug" | "info" | "error";

const levelWeight: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  error: 2
};

let activeLevel: LogLevel = process.env.PLUGINS_LOG_LEVEL === "debug" ? "debug" : "info";

const formatters: Record<LogLevel, (message: string) => string> = {
  debug: message => chalk.gray(`[DEBUG] ${message}`),
  info: message => chalk.blue(`[INFO] ${message}`),
  error: message => chalk.red(`[ERROR] ${message}`)
};

function shouldLog(level: LogLevel): boolean {
  return levelWeight[level] >= levelWeight[activeLevel];
}

/**
 * Set log level for runtime diagnostics.
 *
 * @param level - Desired logging level.
 * @throws Error if level is not recognised.
 */
export function setLogLevel(level: LogLevel): void {
  if (levelWeight[level] === undefined) {
    throw new Error(`Unsupported log level: ${level}`);
  }
  activeLevel = level;
}

/**
 * Emit information-level log entry.
 *
 * Invariant: message must be human-readable summary for pipeline stages.
 *
 * @param message - Log message text.
 */
export function info(message: string): void {
  if (shouldLog("info")) {
    console.log(formatters.info(message));
  }
}

/**
 * Emit debug-level log entry.
 *
 * @param message - Detailed diagnostic message.
 */
export function debug(message: string): void {
  if (shouldLog("debug")) {
    console.log(formatters.debug(message));
  }
}

/**
 * Emit error-level log entry.
 *
 * @param message - Description of encountered error.
 */
export function error(message: string): void {
  if (shouldLog("error")) {
    console.error(formatters.error(message));
  }
}
