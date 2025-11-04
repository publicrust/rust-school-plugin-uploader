// CHANGE: Manage persistent cache to uphold notification idempotence.
// WHY: Prevents duplicate Discord messages by recording metadata post-success.
// QUOTE(TЗ): "Атомарность кеша: состояние (`plugins-state.json`) пишется после успешной отправки."
// REF: REQ-6
// SOURCE: internal reasoning

import fs from "fs-extra";
import { STATE } from "./config.js";
import { debug, info } from "./logger.js";
import { CachedEntry, StateFile } from "./types.js";

const EMPTY_STATE: StateFile = {
  entries: {},
  version: STATE.VERSION,
  updatedAt: ""
};

/**
 * Wrapper around cache persistence with atomic writes.
 */
export class StateCache {
  private state: StateFile = EMPTY_STATE;

  /**
   * Load cache from disk if present.
   */
  async load(): Promise<void> {
    if (!(await fs.pathExists(STATE.PATH))) {
      debug("Cache file absent, starting with empty state.");
      this.state = { ...EMPTY_STATE };
      return;
    }
    try {
      const parsed = (await fs.readJson(STATE.PATH)) as StateFile;
      if (parsed.version !== STATE.VERSION) {
        info("Cache version mismatch, reinitialising.");
        this.state = { ...EMPTY_STATE };
        return;
      }
      this.state = parsed;
    } catch (error) {
      info(`Cache read failed (${(error as Error).message}), reinitialising.`);
      this.state = { ...EMPTY_STATE };
    }
  }

  /**
   * Retrieve cached entry by key.
   *
   * @param key - Plugin uniqueness key.
   * @returns Cached entry or undefined.
   */
  get(key: string): CachedEntry | undefined {
    return this.state.entries[key];
  }

  /**
   * Store cache entry in-memory.
   *
   * @param entry - Entry to persist on save().
   */
  set(entry: CachedEntry): void {
    this.state = {
      ...this.state,
      entries: {
        ...this.state.entries,
        [entry.key]: entry
      }
    };
  }

  /**
   * Persist state atomically by writing to temporary file before rename.
   */
  async save(): Promise<void> {
    const payload: StateFile = {
      ...this.state,
      updatedAt: new Date().toISOString()
    };
    const tempPath = `${STATE.PATH}.tmp`;
    await fs.writeJson(tempPath, payload, { spaces: 2 });
    await fs.move(tempPath, STATE.PATH, { overwrite: true });
    this.state = payload;
    debug(`Cache saved with ${Object.keys(this.state.entries).length} entries.`);
  }

  /**
   * Remove all entries from cache and persist.
   */
  async clear(): Promise<void> {
    this.state = { ...EMPTY_STATE };
    await this.save();
  }

  /**
   * Obtain simple statistics for CLI reporting.
   *
   * @returns Count and last update timestamp.
   */
  stats(): { readonly count: number; readonly updatedAt: string } {
    return {
      count: Object.keys(this.state.entries).length,
      updatedAt: this.state.updatedAt
    };
  }

  /**
   * Expose immutable snapshot of entries for iteration.
   */
  entries(): ReadonlyArray<CachedEntry> {
    return Object.values(this.state.entries);
  }
}
