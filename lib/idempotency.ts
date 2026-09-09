import { createHash } from "node:crypto";

/**
 * Deterministic hex digest of the given parts, joined with a NUL separator
 * (so e.g. ["ab", "c"] and ["a", "bc"] can't collide). Same inputs always
 * produce the same output, so calling this again for the same note/tag on
 * a retry yields the same key the provider already saw.
 */
export function contentDigest(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

/**
 * Todoist's X-Request-Id must not exceed 36 bytes. Truncating a hex digest
 * to 36 characters is exactly 36 bytes (hex is pure ASCII) and still has
 * ~144 bits of input entropy going in — far more than enough to avoid
 * accidental collisions between unrelated notes.
 */
export function todoistRequestId(tag: string, date: string, text: string): string {
  return contentDigest([tag, date, text]).slice(0, 36);
}

/**
 * Resend allows up to 256 characters and recommends a readable
 * `<event-type>/<entity-id>` shape. We don't have a natural entity ID, so
 * we use a truncated content digest as the "entity" part.
 */
export function resendIdempotencyKey(date: string, text: string): string {
  return `notebook-email/${date}/${contentDigest(["W", date, text]).slice(0, 32)}`;
}
