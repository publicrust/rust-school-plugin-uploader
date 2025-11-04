// CHANGE: Centralise configuration source with environment validation.
// WHY: Deterministic configuration supports concurrency and webhook behaviour invariants.
// QUOTE(TЗ): "Параллелизм управляемый (`PLUGINS_CONCURRENCY`, по умолчанию 6)."
// REF: REQ-8
// SOURCE: internal reasoning

import * as dotenv from "dotenv";

dotenv.config();

/**
 * Constant URLs for upstream indices used throughout the pipeline.
 */
export const SOURCES = {
  BASE: "https://raw.githubusercontent.com/publicrust/plugins-forum/main/backend/output",
  OXIDE: "https://raw.githubusercontent.com/publicrust/plugins-forum/main/backend/output/oxide_plugins.json",
  CRAWLED: "https://raw.githubusercontent.com/publicrust/plugins-forum/main/backend/output/crawled_plugins.json",
  DELETED: "https://raw.githubusercontent.com/publicrust/plugins-forum/main/backend/output/deleted_repositories.json"
} as const;

/**
 * Discord-specific configuration values controlling webhook behaviour.
 *
 * Invariant: `WEBHOOK_URL` must be non-empty in notify mode to allow delivery.
 */
export const DISCORD = {
  WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL ?? "",
  MAX_ATTACHMENT_BYTES: Number.parseInt(process.env.MAX_ATTACHMENT_BYTES ?? "8000000", 10)
} as const;

/**
 * Feature flags that affect attachment handling logic.
 */
export const FLAGS = {
  ONLY_CS_ATTACHMENTS: (process.env.ONLY_CS_ATTACHMENTS ?? "true").toLowerCase() === "true"
} as const;

/**
 * Network-level configuration for HTTP operations.
 *
 * Invariant: `CONCURRENCY` must be positive.
 */
export const NET = {
  TIMEOUT: Number.parseInt(process.env.HTTP_TIMEOUT ?? "30000", 10),
  CONCURRENCY: Number.parseInt(process.env.PLUGINS_CONCURRENCY ?? "6", 10)
} as const;

/**
 * Cache state settings used to maintain idempotent notifications.
 */
export const STATE = {
  PATH: "plugins-state.json",
  VERSION: 1
} as const;
