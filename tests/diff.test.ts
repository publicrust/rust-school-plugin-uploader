// CHANGE: Exercise delta computation for new, unchanged, and metadata-poor cases.
// WHY: Validates notification idempotence logic against cached state.
// QUOTE(TЗ): "Сравнить итоговый список с кешом: Новый плагин → отправить уведомление. ... Без изменений → пропустить."
// REF: REQ-4
// SOURCE: internal reasoning

import { afterEach, describe, expect, it, vi } from "vitest";
import { computeDelta } from "../src/diff.js";
import * as api from "../src/api.js";
import { CachedEntry, IndexedPlugin } from "../src/types.js";

const plugin: IndexedPlugin = {
  plugin_name: "Delta",
  file: { raw_url: "https://example.com/plugin.cs", path: "plugin.cs" },
  repository: { full_name: "owner/repo" }
};

describe("computeDelta", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects new plugin", async () => {
    vi.spyOn(api, "headMeta").mockResolvedValue({
      etag: "etag-1",
      lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
      contentLength: 1024,
      contentType: "text/plain"
    });
    const result = await computeDelta([plugin], new Map());
    expect(result).toHaveLength(1);
    expect(result[0]?.reason).toBe("new");
  });

  it("skips unchanged plugin when metadata matches cache", async () => {
    vi.spyOn(api, "headMeta").mockResolvedValue({
      etag: "etag-cache",
      lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
      contentLength: 1024,
      contentType: "text/plain"
    });
    const cacheEntry: CachedEntry = {
      key: plugin.file.raw_url ?? "missing",
      etag: "etag-cache",
      lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
      contentHash: "hash",
      fileSize: 1024,
      notifiedAt: "2024-01-02T00:00:00Z"
    };
    const result = await computeDelta([plugin], new Map([[cacheEntry.key, cacheEntry]]));
    expect(result).toHaveLength(0);
  });

  // CHANGE: Verify metadata absence triggers hash requirement.
  // WHY: Ensures fallback to SHA-256 per idempotence invariant.
  // QUOTE(TЗ): "Идемпотентность уведомлений: ... по `ETag`/`Last-Modified`/`sha256`."
  // REF: REQ-6
  // SOURCE: internal reasoning
  it("requests content hash check when metadata unreliable", async () => {
    vi.spyOn(api, "headMeta").mockResolvedValue({});
    const cacheEntry: CachedEntry = {
      key: plugin.file.raw_url ?? "missing",
      contentHash: "hash",
      notifiedAt: "2024-01-02T00:00:00Z"
    };
    const result = await computeDelta([plugin], new Map([[cacheEntry.key, cacheEntry]]));
    expect(result).toHaveLength(1);
    expect(result[0]?.metadata.requiresContentHashCheck).toBe(true);
  });
});
