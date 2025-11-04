// CHANGE: Provide canonical plugin key derivation shared across modules.
// WHY: Unifies uniqueness invariant for merging and caching.
// QUOTE(TЗ): "Уникальность плагина: ключ = `file.raw_url`. Если отсутствует — fallback: `repository.full_name :: file.path`."
// REF: REQ-2
// SOURCE: internal reasoning

import { IndexedPlugin } from "../types.js";

/**
 * Compute unique identifier for plugin entries.
 *
 * @param plugin - Plugin entry.
 * @returns Stable uniqueness key.
 */
export function pluginKey(plugin: IndexedPlugin): string {
  if (plugin.file.raw_url) {
    return plugin.file.raw_url;
  }
  const repository = plugin.repository?.full_name ?? plugin.repository?.name ?? "repository";
  const path = plugin.file.path ?? "file";
  return `${repository}::${path}`;
}
