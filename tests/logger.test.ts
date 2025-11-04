// CHANGE: Verify logger respects configured log level.
// WHY: Ensures INFO/DEBUG/ERROR semantics align with specification.
// QUOTE(TЗ): "Логи: INFO (сводка), DEBUG (детали HTTP/кеша), ERROR (исключения)."
// REF: REQ-9
// SOURCE: internal reasoning

import { afterEach, describe, expect, it, vi } from "vitest";
import { debug, info, setLogLevel } from "../src/logger.js";

describe("logger", () => {
  const originalLevel = process.env.PLUGINS_LOG_LEVEL;

  afterEach(() => {
    process.env.PLUGINS_LOG_LEVEL = originalLevel;
    setLogLevel("info");
    vi.restoreAllMocks();
  });

  it("suppresses debug logs when level is info", () => {
    setLogLevel("info");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    debug("hidden");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("emits debug logs when level is debug", () => {
    setLogLevel("debug");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    debug("visible");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("always logs info regardless of debug level", () => {
    setLogLevel("info");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    info("always");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
