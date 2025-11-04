// CHANGE: Merge oxide and crawled indices with deduplication and field precedence.
// WHY: Guarantees uniqueness invariants while preferring richer crawled metadata.
// QUOTE(TЗ): "Объединить (merge) по ключу, отдавая приоритет заполненным полям (author/version/description) из `crawled`."
// REF: REQ-2
// SOURCE: internal reasoning

import { IndexedPlugin, PluginIndex } from "./types.js";
import { pluginKey } from "./utils/plugin-key.js";

function mergeField<T>(primary: T | undefined, secondary: T | undefined): T | undefined {
  return secondary === undefined || secondary === null || secondary === "" ? primary : secondary;
}

function mergePlugin(existing: IndexedPlugin, incoming: IndexedPlugin): IndexedPlugin {
  return {
    plugin_name: mergeField(existing.plugin_name, incoming.plugin_name),
    plugin_author: mergeField(existing.plugin_author, incoming.plugin_author),
    plugin_version: mergeField(existing.plugin_version, incoming.plugin_version),
    plugin_description: mergeField(existing.plugin_description, incoming.plugin_description),
    plugin_resource_id: mergeField(existing.plugin_resource_id, incoming.plugin_resource_id),
    categories: incoming.categories?.length ? incoming.categories : existing.categories,
    file: incoming.file.raw_url ? incoming.file : existing.file,
    repository: incoming.repository ?? existing.repository,
    extra: { ...existing.extra, ...incoming.extra }
  };
}

/**
 * Merge two plugin indices respecting field priority rules.
 *
 * @param oxide - Base index.
 * @param crawled - Crawled index with enriched metadata.
 * @returns Combined index with deduplicated items.
 */
export function mergeIndices(oxide: PluginIndex, crawled: PluginIndex): PluginIndex {
  const merged = new Map<string, IndexedPlugin>();
  for (const plugin of oxide.items) {
    merged.set(pluginKey(plugin), plugin);
  }
  for (const plugin of crawled.items) {
    const key = pluginKey(plugin);
    const existing = merged.get(key);
    merged.set(
      key,
      existing ? mergePlugin(existing, plugin) : plugin
    );
  }
  const items = Array.from(merged.values());
  return {
    generated_at: new Date().toISOString(),
    query: `Merged oxide(${oxide.count}) + crawled(${crawled.count})`,
    count: items.length,
    items
  };
}
