import { describe, expect, it } from "vitest";
import { contentDigest, resendIdempotencyKey, todoistRequestId } from "./idempotency";

describe("idempotency", () => {
  describe("contentDigest", () => {
    it("is deterministic (same input produces same digest)", () => {
      const digest1 = contentDigest(["T", "2026-09-09", "Hello world"]);
      const digest2 = contentDigest(["T", "2026-09-09", "Hello world"]);
      expect(digest1).toBe(digest2);
    });

    it("is sensitive to each part", () => {
      const base = contentDigest(["T", "2026-09-09", "Hello world"]);
      const diffTag = contentDigest(["I", "2026-09-09", "Hello world"]);
      const diffDate = contentDigest(["T", "2026-09-10", "Hello world"]);
      const diffText = contentDigest(["T", "2026-09-09", "Hello world!"]);

      expect(diffTag).not.toBe(base);
      expect(diffDate).not.toBe(base);
      expect(diffText).not.toBe(base);
    });

    it("prevents collision when boundary characters shift due to NUL separator", () => {
      const digest1 = contentDigest(["ab", "c"]);
      const digest2 = contentDigest(["a", "bc"]);
      expect(digest1).not.toBe(digest2);
    });
  });

  describe("todoistRequestId", () => {
    it("is always exactly 36 characters long", () => {
      const key = todoistRequestId("T", "2026-09-09", "Buy milk");
      expect(key.length).toBe(36);
    });

    it("is deterministic for identical tag, date, and text", () => {
      const key1 = todoistRequestId("EQ", "2026-09-09", "Fix bug");
      const key2 = todoistRequestId("EQ", "2026-09-09", "Fix bug");
      expect(key1).toBe(key2);
    });
  });

  describe("resendIdempotencyKey", () => {
    it("starts with notebook-email/${date}/ and stays within 256 characters", () => {
      const date = "2026-09-09";
      const key = resendIdempotencyKey(date, "Send newsletter draft");
      expect(key.startsWith(`notebook-email/${date}/`)).toBe(true);
      expect(key.length).toBeLessThanOrEqual(256);
    });

    it("is deterministic for identical date and text", () => {
      const key1 = resendIdempotencyKey("2026-09-09", "Daily log");
      const key2 = resendIdempotencyKey("2026-09-09", "Daily log");
      expect(key1).toBe(key2);
    });
  });
});
