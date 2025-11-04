// CHANGE: Compute delta between current plugins and cached notifications.
// WHY: Enforces idempotent delivery by analysing metadata and cache state.
// QUOTE(TЗ): "Сравнить итоговый список с кешом... Новый плагин → отправить уведомление. Обновлённый ... → отправить уведомление. Без изменений → пропустить."
// REF: REQ-4
// SOURCE: internal reasoning

import pLimit from "p-limit";
import { NET } from "./config.js";
import { headMeta } from "./api.js";
import { debug } from "./logger.js";
import { CachedEntry, IndexedPlugin } from "./types.js";
import { pluginKey } from "./utils/plugin-key.js";

export type DiffReason = "new" | "updated";

export interface DiffMetadata {
  readonly etag?: string;
  readonly lastModified?: string;
  readonly contentLength?: number;
  readonly requiresContentHashCheck: boolean;
}

export interface DiffItem {
  readonly plugin: IndexedPlugin;
  readonly reason: DiffReason;
  readonly cacheKey: string;
  readonly metadata: DiffMetadata;
  readonly previous?: CachedEntry;
}

const limit = pLimit(Math.max(1, NET.CONCURRENCY));

function hasReliableMarkers(meta: DiffMetadata, plugin: IndexedPlugin): boolean {
  return Boolean(meta.etag || meta.lastModified || plugin.file.sha);
}

function unchanged(meta: DiffMetadata, plugin: IndexedPlugin, previous: CachedEntry): boolean {
  if (meta.etag && previous.etag && meta.etag === previous.etag) {
    return true;
  }
  if (meta.lastModified && previous.lastModified && meta.lastModified === previous.lastModified) {
    return true;
  }
  if (plugin.file.sha && previous.fileSha && plugin.file.sha === previous.fileSha) {
    return true;
  }
  if (meta.contentLength !== undefined && previous.fileSize !== undefined && meta.contentLength === previous.fileSize) {
    return true;
  }
  if (plugin.file.size !== undefined && previous.fileSize !== undefined && plugin.file.size === previous.fileSize) {
    return true;
  }
  return false;
}

/**
 * Determine which plugins must trigger notifications compared to cached state.
 *
 * @param plugins - Stable list of plugins after merging/filtering.
 * @param cache - Cache map keyed by plugin key.
 * @returns Array of delta items.
 */
export async function computeDelta(
  plugins: readonly IndexedPlugin[],
  cache: Map<string, CachedEntry>
): Promise<DiffItem[]> {
  const total = plugins.length;
  const progressInterval = Math.max(1, Math.floor(total / 100));
  let processed = 0;
  const reportProgress = () => {
    processed += 1;
    if (processed % progressInterval === 0 || processed === total) {
      debug(`computeDelta progress: ${processed}/${total}`);
    }
  };
  const results = await Promise.all(
    plugins.map(plugin =>
      limit(async () => {
        const key = pluginKey(plugin);
        const previous = cache.get(key);
        let outcome: DiffItem | null = null;
        if (!previous) {
          const meta = plugin.file.raw_url ? await headMeta(plugin.file.raw_url) : {};
          const metadata: DiffMetadata = {
            etag: meta.etag,
            lastModified: meta.lastModified,
            contentLength: meta.contentLength ?? plugin.file.size,
            requiresContentHashCheck: false
          };
          outcome = {
            plugin,
            reason: "new",
            cacheKey: key,
            metadata
          };
          reportProgress();
          return outcome;
        }
        const meta = plugin.file.raw_url ? await headMeta(plugin.file.raw_url) : {};
        const baseMeta: DiffMetadata = {
          etag: meta.etag,
          lastModified: meta.lastModified,
          contentLength: meta.contentLength ?? plugin.file.size,
          requiresContentHashCheck: false
        };
        const reliable = hasReliableMarkers(baseMeta, plugin);
        const metadata: DiffMetadata = {
          ...baseMeta,
          requiresContentHashCheck: !reliable
        };
        if (!reliable) {
          debug(`No reliable metadata for ${key}, content hash check required.`);
          outcome = {
            plugin,
            reason: "updated",
            cacheKey: key,
            metadata,
            previous
          };
          reportProgress();
          return outcome;
        }
        if (unchanged(metadata, plugin, previous)) {
          // CHANGE: Trace unchanged plugins for diagnostic clarity.
          // WHY: Helps explain skipped notifications when metadata aligns with cache.
          // QUOTE(TЗ): "Логи: INFO (сводка), DEBUG (детали HTTP/кеша), ERROR (исключения)."
          // REF: REQ-9
          // SOURCE: internal reasoning
          debug(`Unchanged plugin ${key} detected, skipping delta entry.`);
          reportProgress();
          return null;
        }
        const diff: DiffItem = {
          plugin,
          reason: "updated",
          cacheKey: key,
          metadata,
          previous
        };
        // CHANGE: Log delta detection for updated plugins.
        // WHY: Provides transparency when plugin moves into notification set.
        // QUOTE(TЗ): "Логи: INFO (сводка), DEBUG (детали HTTP/кеша), ERROR (исключения)."
        // REF: REQ-9
        // SOURCE: internal reasoning
        debug(`Delta detected: ${key} marked as updated.`);
        outcome = diff;
        reportProgress();
        return outcome;
      })
    )
  );
  return results.filter((item): item is DiffItem => item !== null);
}
