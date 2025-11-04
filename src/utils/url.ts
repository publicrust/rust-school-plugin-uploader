// CHANGE: Provide raw URL normalisation helper for plugin file downloads.
// WHY: Some source entries contain characters like '#' that break HTTP requests without encoding.
// QUOTE(TЗ): "Стабильность сети: бэкофф и повтор при 5xx/сетевых ошибках."
// REF: REQ-8
// SOURCE: internal reasoning

/**
 * Normalise raw file URL to ensure it is safe for HTTP requests.
 *
 * @param rawUrl - URL extracted from upstream index.
 * @returns URL with reserved characters URL-encoded.
 */
export function normalizeRawUrl(rawUrl: string): string {
  return rawUrl.replace(/#/g, "%23");
}
