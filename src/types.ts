// CHANGE: Define strongly typed domain models for plugin indexing pipeline.
// WHY: Typed models enforce invariants for merging, diffing, and webhook payloads.
// QUOTE(TЗ): "Собрать с GitHub JSON-индексы плагинов, объединить (dedupe), отфильтровать удалённые репозитории..."
// REF: REQ-1
// SOURCE: internal reasoning

/**
 * JSON-like value type used for permissive properties without `any` usage.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  // CHANGE: Accept readonly arrays produced by JSON parsing.
  // WHY: Type guard must treat upstream immutable arrays as valid schema representations.
  // QUOTE(TЗ): "Загрузить оба индекса параллельно, валидировать схему (наличие `items`)."
  // REF: REQ-1
  // SOURCE: internal reasoning
  | readonly JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Reference to a plugin file as listed by upstream indices.
 *
 * @property path - Repository-relative file path.
 * @property raw_url - Direct download URL.
 * @property sha - Optional git commit hash for the file content.
 * @property size - File size in bytes, if provided.
 *
 * Invariant: either `raw_url` is defined or fallback resolution logic must provide a unique key.
 */
export interface PluginFileRef {
  readonly path?: string;
  readonly raw_url?: string;
  readonly sha?: string;
  readonly size?: number;
}

/**
 * Reference to the repository that contains a plugin file.
 *
 * @property name - Repository name without owner.
 * @property full_name - Fully qualified name in the form owner/repo.
 * @property html_url - Browser URL to the repository.
 * @property description - Repository description from GitHub.
 * @property stargazers_count - Stargazer count to enrich embeds.
 * @property archived - Whether the repository is archived on GitHub.
 */
export interface PluginRepoRef {
  readonly name?: string;
  readonly full_name?: string;
  readonly html_url?: string;
  readonly description?: string;
  readonly stargazers_count?: number;
  readonly archived?: boolean;
}

/**
 * Representation of a plugin entry obtained from upstream indices.
 *
 * @property plugin_name - Human readable name.
 * @property plugin_author - Listed author.
 * @property plugin_version - Version string.
 * @property plugin_description - Description text.
 * @property plugin_resource_id - Optional id in upstream catalogues.
 * @property categories - The categories assigned to the plugin.
 * @property file - File reference.
 * @property repository - Repository metadata.
 * @property extra - Additional un-modeled fields retained for completeness.
 */
export interface IndexedPlugin {
  readonly plugin_name?: string;
  readonly plugin_author?: string;
  readonly plugin_version?: string;
  readonly plugin_description?: string;
  readonly plugin_resource_id?: string | number;
  readonly categories?: readonly string[];
  readonly file: PluginFileRef;
  readonly repository?: PluginRepoRef;
  readonly extra?: { readonly [key: string]: JsonValue };
}

/**
 * Plugin index collection result fetched from upstream JSON endpoints.
 *
 * @property generated_at - ISO timestamp produced by upstream.
 * @property query - Optional search query metadata.
 * @property count - Declared number of items.
 * @property items - List of plugins.
 */
export interface PluginIndex {
  readonly generated_at: string;
  readonly query?: string;
  readonly count: number;
  readonly items: readonly IndexedPlugin[];
}

/**
 * Structure of the optional deleted repositories list.
 *
 * @property repositories - Lowercase repository identifiers blocked from publishing.
 * @property updated_at - Timestamp of the list update.
 */
export interface DeletedRepositoriesList {
  readonly repositories: readonly string[];
  readonly updated_at?: string;
}

/**
 * Cached notification entry persisted to avoid duplicate notifications.
 *
 * @property key - Unique identifier for cached plugin.
 * @property etag - ETag recorded from upstream HEAD request.
 * @property lastModified - Last-Modified header captured during notification.
 * @property contentHash - SHA-256 hash of the downloaded attachment content.
 * @property fileSha - Upstream git hash from index entry.
 * @property fileSize - Reported size to cross-check attachments.
 * @property notifiedAt - ISO timestamp of the notification.
 */
export interface CachedEntry {
  readonly key: string;
  readonly etag?: string;
  readonly lastModified?: string;
  readonly contentHash?: string;
  // CHANGE: Persist source SHA reported by index alongside notification metadata.
  // WHY: Provides fallback invariant when HTTP metadata is missing.
  // QUOTE(TЗ): "Идемпотентность уведомлений: на один и тот же контент (по `ETag`/`Last-Modified`/`sha256`) не слать повторно."
  // REF: REQ-6
  // SOURCE: internal reasoning
  readonly fileSha?: string;
  readonly fileSize?: number;
  readonly notifiedAt: string;
}

/**
 * Shape of the cache file that maintains notification state.
 *
 * @property entries - Mapping of plugin key to cached entry.
 * @property version - Schema version for cache migrations.
 * @property updatedAt - Timestamp of the latest persistence.
 */
export interface StateFile {
  readonly entries: { readonly [key: string]: CachedEntry };
  readonly version: number;
  readonly updatedAt: string;
}
