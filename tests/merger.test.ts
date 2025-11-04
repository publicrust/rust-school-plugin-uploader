// CHANGE: Verify merging behaviour prioritises crawled metadata.
// WHY: Ensures deduplication invariants remain intact.
// QUOTE(TЗ): "Объединить (merge) по ключу, отдавая приоритет заполненным полям..."
// REF: REQ-2
// SOURCE: internal reasoning

import { describe, expect, it } from "vitest";
import { mergeIndices } from "../src/merger.js";
import { PluginIndex } from "../src/types.js";

describe("mergeIndices", () => {
  it("prefers crawled metadata for duplicate entries", () => {
    const oxide: PluginIndex = {
      generated_at: "2024-01-01T00:00:00Z",
      query: undefined,
      count: 1,
      items: [
        {
          plugin_name: "Legacy",
          plugin_author: undefined,
          plugin_version: "1.0.0",
          plugin_description: "Oxide desc",
          plugin_resource_id: 1,
          categories: ["oxide"],
          file: { raw_url: "https://example.com/plugin.cs", path: "plugin.cs" },
          repository: { full_name: "oxide/repo" },
          extra: {}
        }
      ]
    };
    const crawled: PluginIndex = {
      generated_at: "2024-01-02T00:00:00Z",
      query: undefined,
      count: 1,
      items: [
        {
          plugin_name: "Enhanced",
          plugin_author: "Crawler",
          plugin_version: "2.0.0",
          plugin_description: "Crawled desc",
          plugin_resource_id: 1,
          categories: ["crawled"],
          file: { raw_url: "https://example.com/plugin.cs", path: "src/plugin.cs" },
          repository: { full_name: "oxide/repo" },
          extra: {}
        }
      ]
    };

    const merged = mergeIndices(oxide, crawled);
    expect(merged.items).toHaveLength(1);
    const [plugin] = merged.items;
    expect(plugin.plugin_name).toBe("Enhanced");
    expect(plugin.plugin_author).toBe("Crawler");
    expect(plugin.plugin_version).toBe("2.0.0");
    expect(plugin.plugin_description).toBe("Crawled desc");
    expect(plugin.categories).toStrictEqual(["crawled"]);
    expect(plugin.file.path).toBe("src/plugin.cs");
  });
});
