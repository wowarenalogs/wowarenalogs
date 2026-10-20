/**
 * Base64-encode a string that may contain characters outside the Latin1 range.
 *
 * Plain `btoa` throws ("The string to be encoded contains characters outside of
 * the Latin1 range.") on non-Latin1 input, which happens for accented or
 * non-Latin WoW realm/player names and for file paths under non-ASCII user
 * directories. Encoding to UTF-8 bytes first avoids that.
 *
 * The output is standard UTF-8 base64: identical to `btoa` for pure-ASCII input
 * and decodable with `Buffer.from(str, 'base64').toString('utf-8')`.
 */
export function base64EncodeUnicode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
