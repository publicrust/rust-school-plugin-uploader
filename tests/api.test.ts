// CHANGE: Validate index fetching and deletion filtering behaviours.
// WHY: Guarantees schema validation and repository filtering invariants.
// QUOTE(TЗ): "Загрузить оба индекса параллельно, валидировать схему (наличие `items`)."
// REF: REQ-1
// SOURCE: internal reasoning

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchIndex, filterDeleted, headMeta } from "../src/api.js";
import * as http from "../src/utils/http.js";
import { normalizeRawUrl } from "../src/utils/url.js";
import { DeletedRepositoriesList, JsonValue } from "../src/types.js";

const sampleIndex = {
  generated_at: "2024-01-01T00:00:00Z",
  count: 1,
  items: [
    {
      plugin_name: "Sample",
      plugin_author: "Dev",
      plugin_version: "1.0.0",
      plugin_description: "Description",
      plugin_resource_id: 42,
      categories: ["fun"],
      file: { raw_url: "https://example.com/plugin.cs", path: "plugin.cs" },
      repository: { full_name: "owner/repo" }
    }
  ]
} satisfies JsonValue;

describe("api.fetchIndex", () => {
  beforeEach(() => {
    vi.spyOn(http, "getJson").mockResolvedValue({
      data: sampleIndex,
      headers: {},
      status: 200
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses index with items array", async () => {
    const index = await fetchIndex("https://example.com/index.json");
    expect(index.items).toHaveLength(1);
    expect(index.items[0].plugin_name).toBe("Sample");
  });
});

describe("api.filterDeleted", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // CHANGE: Confirm deleted repositories are excluded.
  // WHY: Prevents notifications for removed sources per invariant.
  // QUOTE(TЗ): "Отфильтровать `deleted_repositories.json` (если доступен)."
  // REF: REQ-3
  // SOURCE: internal reasoning
  it("removes plugins from deleted repositories list", () => {
    const plugins = [
      {
        plugin_name: "Keep",
        file: { raw_url: "https://example.com/keep.cs" },
        repository: { full_name: "owner/keep" }
      },
      {
        plugin_name: "Drop",
        file: { raw_url: "https://example.com/drop.cs" },
        repository: { full_name: "owner/drop" }
      }
    ];
    const deleted: DeletedRepositoriesList = {
      repositories: ["owner/drop"]
    };
    const filtered = filterDeleted(plugins, deleted);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.plugin_name).toBe("Keep");
  });

  it("encodes raw URL fragments before making HEAD request", async () => {
    const headSpy = vi.spyOn(http, "head").mockResolvedValue({
      headers: {},
      status: 200
    });
    await headMeta("https://example.com/file#hash");
    expect(headSpy).toHaveBeenCalledWith("https://example.com/file%23hash");
  });
});

describe("normalizeRawUrl", () => {
  it("replaces '#' with encoded sequence", () => {
    expect(normalizeRawUrl("https://example.com/a#b")).toBe("https://example.com/a%23b");
  });
});
