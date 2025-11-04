// CHANGE: Implement HTTP-facing operations for indices, deletions, metadata, and file retrieval.
// WHY: Centralises network logic to uphold schema validation and filtering invariants.
// QUOTE(TЗ): "Загрузить оба индекса параллельно, валидировать схему (наличие `items`)."
// REF: REQ-1
// SOURCE: internal reasoning

import { SOURCES } from "./config.js";
import { debug } from "./logger.js";
import { getBinary, getJson, head } from "./utils/http.js";
import { IndexedPlugin, DeletedRepositoriesList, JsonValue, PluginIndex } from "./types.js";
import { normalizeRawUrl } from "./utils/url.js";

const RESERVED_KEYS = new Set([
  "plugin_name",
  "plugin_author",
  "plugin_version",
  "plugin_description",
  "plugin_resource_id",
  "categories",
  "file",
  "repository"
]);

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertHasItems(value: JsonValue, url: string): asserts value is {
  readonly items: readonly JsonValue[];
  readonly count?: number;
  readonly generated_at?: string;
  readonly query?: JsonValue;
} {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error(`Malformed index: ${url}`);
  }
}

function toPluginIndex(value: JsonValue, url: string): PluginIndex {
  assertHasItems(value, url);
  const items = value.items.map(raw => {
    if (!isRecord(raw)) {
      throw new Error(`Malformed plugin item in ${url}`);
    }
    if (!isRecord(raw.file)) {
      throw new Error(`Missing file reference in ${url}`);
    }
    return {
      plugin_name: typeof raw.plugin_name === "string" ? raw.plugin_name : undefined,
      plugin_author: typeof raw.plugin_author === "string" ? raw.plugin_author : undefined,
      plugin_version: typeof raw.plugin_version === "string" ? raw.plugin_version : undefined,
      plugin_description: typeof raw.plugin_description === "string" ? raw.plugin_description : undefined,
      plugin_resource_id:
        typeof raw.plugin_resource_id === "string" || typeof raw.plugin_resource_id === "number"
          ? raw.plugin_resource_id
          : undefined,
      categories: Array.isArray(raw.categories) ? (raw.categories.filter(item => typeof item === "string") as string[]) : undefined,
      file: {
        path: typeof raw.file.path === "string" ? raw.file.path : undefined,
        raw_url: typeof raw.file.raw_url === "string" ? raw.file.raw_url : undefined,
        sha: typeof raw.file.sha === "string" ? raw.file.sha : undefined,
        size: typeof raw.file.size === "number" ? raw.file.size : undefined
      },
      repository: isRecord(raw.repository)
        ? {
            name: typeof raw.repository.name === "string" ? raw.repository.name : undefined,
            full_name: typeof raw.repository.full_name === "string" ? raw.repository.full_name : undefined,
            html_url: typeof raw.repository.html_url === "string" ? raw.repository.html_url : undefined,
            description: typeof raw.repository.description === "string" ? raw.repository.description : undefined,
            stargazers_count:
              typeof raw.repository.stargazers_count === "number" ? raw.repository.stargazers_count : undefined,
            archived: typeof raw.repository.archived === "boolean" ? raw.repository.archived : undefined
          }
        : undefined,
      extra: Object.fromEntries(Object.entries(raw).filter(([key]) => !RESERVED_KEYS.has(key)))
    };
  });
  return {
    generated_at: typeof value.generated_at === "string" ? value.generated_at : new Date().toISOString(),
    query: typeof value.query === "string" ? value.query : undefined,
    count: typeof value.count === "number" ? value.count : items.length,
    items
  };
}

/**
 * Download index file and enforce schema constraints.
 *
 * @param url - Source URL.
 * @returns Normalised plugin index.
 */
export async function fetchIndex(url: string): Promise<PluginIndex> {
  const response = await getJson<JsonValue>(url);
  debug(`Fetched index ${url} with status ${response.status}`);
  return toPluginIndex(response.data, url);
}

/**
 * Retrieve optional deleted repositories list.
 *
 * @returns Parsed list or null if unavailable.
 */
export async function fetchDeleted(): Promise<DeletedRepositoriesList | null> {
  try {
    const response = await getJson<JsonValue>(SOURCES.DELETED);
    if (!isRecord(response.data) || !Array.isArray(response.data.repositories)) {
      return null;
    }
    const repositories = response.data.repositories.filter((item): item is string => typeof item === "string");
    return {
      repositories,
      updated_at: typeof response.data.updated_at === "string" ? response.data.updated_at : undefined
    };
  } catch (error) {
    debug(`Deleted repositories list unavailable: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Filter plugins using deleted repositories list.
 *
 * @param items - Candidate plugins.
 * @param deleted - Optional deleted repositories data.
 * @returns Filtered plugin array.
 */
export function filterDeleted(items: readonly IndexedPlugin[], deleted: DeletedRepositoriesList | null): IndexedPlugin[] {
  if (!deleted) {
    return [...items];
  }
  const banned = new Set(deleted.repositories.map(entry => entry.toLowerCase()));
  const filtered = items.filter(plugin => {
    const repo = plugin.repository?.full_name;
    return repo ? !banned.has(repo.toLowerCase()) : true;
  });
  // CHANGE: Log filtering result to aid in understanding removal effects.
  // WHY: Offers DEBUG-level detail on deleted repository suppression per logging requirement.
  // QUOTE(TЗ): "Логи: INFO (сводка), DEBUG (детали HTTP/кеша), ERROR (исключения)."
  // REF: REQ-9
  // SOURCE: internal reasoning
  debug(`Filtered out ${items.length - filtered.length} plugins due to deleted repositories list.`);
  return filtered;
}

/**
 * Request metadata headers for a raw plugin file without downloading the body.
 *
 * @param rawUrl - Direct file URL.
 * @returns Metadata derived from HTTP headers.
 */
export async function headMeta(
  rawUrl: string
): Promise<{ readonly etag?: string; readonly lastModified?: string; readonly contentLength?: number; readonly contentType?: string }> {
  try {
    const response = await head(normalizeRawUrl(rawUrl));
    return {
      etag: response.headers.etag,
      lastModified: response.headers["last-modified"],
      contentLength: response.headers["content-length"] ? Number.parseInt(response.headers["content-length"], 10) : undefined,
      contentType: response.headers["content-type"]
    };
  } catch (error) {
    debug(`HEAD metadata unavailable for ${rawUrl}: ${(error as Error).message}`);
    return {};
  }
}

/**
 * Download plugin file payload as Buffer.
 *
 * @param rawUrl - Direct download URL.
 * @returns Buffer with plugin content.
 */
export async function getFile(rawUrl: string): Promise<Buffer> {
  const response = await getBinary(normalizeRawUrl(rawUrl));
  return response.data;
}
