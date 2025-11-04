// CHANGE: Provide SHA-256 hashing utility for attachment deduplication.
// WHY: Enables idempotence via content hash comparisons when metadata is absent.
// QUOTE(TЗ): "Идемпотентность уведомлений: ... по `ETag`/`Last-Modified`/`sha256`."
// REF: REQ-6
// SOURCE: internal reasoning

import { createHash } from "crypto";

/**
 * Compute SHA-256 hash of provided buffer.
 *
 * @param buffer - Content to hash.
 * @returns Hexadecimal SHA-256 digest.
 */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
