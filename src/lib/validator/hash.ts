/**
 * Privacy-preserving hashing.
 *
 * Only SHA-256 digests of normalized *structural* signatures are ever stored
 * or matched — never document contents, values, or raw names. The hashes below
 * are one-way, so nothing sensitive can be recovered from the persisted rules.
 */

/** SHA-256 hex digest of a string (WebCrypto — runs fully in the browser). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Normalize a name/label before hashing so casing/whitespace don't matter. */
export function normalizeForHash(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function fingerprintJoin(parts: Array<string | undefined>): string {
  return parts.map((p) => p ?? "").join("|");
}

/** Truncated display form of a fingerprint, e.g. "a3f9…c21b". */
export function shortFingerprint(hex: string, head = 8, tail = 4): string {
  if (hex.length <= head + tail) {
    return hex;
  }
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
