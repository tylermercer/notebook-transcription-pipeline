import { describe, expect, it, vi } from "vitest";
import { appendNoteToDoc, FileKVStorage, type KVStorage } from "./storage";

describe("storage", () => {
  describe("appendNoteToDoc", () => {
    it("creates a new document with date header if it does not exist", async () => {
      const store = new Map<string, string>();
      const mockStorage: KVStorage = {
        get: async (key) => store.get(key) ?? null,
        put: async (key, val) => {
          store.set(key, val);
        },
        has: async (key) => store.has(key),
      };

      await appendNoteToDoc(mockStorage, "2026-09-01", "My first entry");

      expect(store.get("2026-09-01")).toBe("# 2026-09-01\n\n- My first entry\n");
    });

    it("appends bullet point to existing document", async () => {
      const store = new Map<string, string>([
        ["2026-09-01", "# 2026-09-01\n\n- Existing entry\n"],
      ]);
      const mockStorage: KVStorage = {
        get: async (key) => store.get(key) ?? null,
        put: async (key, val) => {
          store.set(key, val);
        },
        has: async (key) => store.has(key),
      };

      await appendNoteToDoc(mockStorage, "2026-09-01", "Second entry");

      expect(store.get("2026-09-01")).toBe(
        "# 2026-09-01\n\n- Existing entry\n- Second entry\n",
      );
    });
  });

  describe("FileKVStorage", () => {
    it("calls Bun.file and Bun.write", async () => {
      const mockText = vi.fn().mockResolvedValue("hello world");
      const mockExists = vi.fn().mockResolvedValue(true);
      const mockBunFile = vi.fn().mockReturnValue({
        text: mockText,
        exists: mockExists,
      });
      const mockBunWrite = vi.fn().mockResolvedValue(undefined);

      // Save global Bun reference
      const originalBun = (globalThis as any).Bun;
      (globalThis as any).Bun = {
        file: mockBunFile,
        write: mockBunWrite,
      };

      try {
        const storage = new FileKVStorage("./test-folder");

        const hasRes = await storage.has("2026-09-01");
        expect(mockBunFile).toHaveBeenCalledWith("./test-folder/2026-09-01.md");
        expect(hasRes).toBe(true);

        const getRes = await storage.get("2026-09-01");
        expect(getRes).toBe("hello world");

        await storage.put("2026-09-01", "new data");
        expect(mockBunWrite).toHaveBeenCalledWith("./test-folder/2026-09-01.md", "new data");
      } finally {
        (globalThis as any).Bun = originalBun;
      }
    });

    it("returns null on get if file does not exist", async () => {
      const mockExists = vi.fn().mockResolvedValue(false);
      const mockBunFile = vi.fn().mockReturnValue({
        exists: mockExists,
      });

      const originalBun = (globalThis as any).Bun;
      (globalThis as any).Bun = {
        file: mockBunFile,
      };

      try {
        const storage = new FileKVStorage("./test-folder");
        const getRes = await storage.get("nonexistent");
        expect(getRes).toBeNull();
      } finally {
        (globalThis as any).Bun = originalBun;
      }
    });
  });
});
