import { describe, expect, it, vi } from "vitest";
import { routeNote, routeNotes, type RouteDeps } from "./router";
import type { KVStorage } from "./storage";
import type { AppConfig } from "./config";
import type { Note } from "./types";

function createMockStorage(): KVStorage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    has: async (key: string) => store.has(key),
  };
}

function createMockDeps(overrides?: Partial<RouteDeps>): RouteDeps {
  const config: AppConfig = {
    todoist: {
      apiToken: "todoist-token",
      innerhelmProjectId: "innerhelm-id",
      eqpProjectId: "eqp-id",
    },
    readwise: {
      apiToken: "readwise-token",
    },
    resend: {
      apiKey: "resend-key",
      fromEmail: "from@example.com",
      toEmail: "to@example.com",
    },
    storage: {
      pwFolder: "./pw",
      eFolder: "./e",
    },
  };

  return {
    config,
    pwStorage: createMockStorage(),
    eStorage: createMockStorage(),
    todoist: { createTask: vi.fn().mockResolvedValue(undefined) } as any,
    readwise: { createHighlight: vi.fn().mockResolvedValue(undefined) } as any,
    resend: { sendEmail: vi.fn().mockResolvedValue(undefined) } as any,
    today: () => "2026-09-01",
    ...overrides,
  };
}

describe("router", () => {
  describe("PW tag", () => {
    it("appends note to pwStorage under note's date", async () => {
      const deps = createMockDeps();
      const note: Note = {
        date: "2026-08-20",
        text: "Personal writing entry",
        tags: ["PW"],
      };

      await routeNote(note, deps);

      const store = (deps.pwStorage as any).store as Map<string, string>;
      expect(store.get("2026-08-20")).toBe("# 2026-08-20\n\n- Personal writing entry\n");
    });
  });

  describe("E tag", () => {
    it("creates markdown file for today if today does not exist in eStorage", async () => {
      const deps = createMockDeps({ today: () => "2026-09-01" });
      const note: Note = {
        date: "2026-08-20",
        text: "E note entry",
        tags: ["E"],
      };

      await routeNote(note, deps);

      const store = (deps.eStorage as any).store as Map<string, string>;
      expect(store.get("2026-09-01")).toBe(
        "---\ncreatedDate: 2026-08-20\n---\n\nE note entry",
      );
    });

    it("skips existing dates in eStorage to find the next available date", async () => {
      const deps = createMockDeps({ today: () => "2026-09-01" });
      const store = (deps.eStorage as any).store as Map<string, string>;
      store.set("2026-09-01", "existing content");
      store.set("2026-09-02", "existing content");

      const note: Note = {
        date: "2026-08-20",
        text: "E note entry for next available date",
        tags: ["E"],
      };

      await routeNote(note, deps);

      expect(store.get("2026-09-03")).toBe(
        "---\ncreatedDate: 2026-08-20\n---\n\nE note entry for next available date",
      );
    });

    it("claims consecutive dates across multiple E notes in routeNotes", async () => {
      const deps = createMockDeps({ today: () => "2026-09-01" });
      const notes: Note[] = [
        { date: "2026-08-20", text: "First E note", tags: ["E"] },
        { date: "2026-08-21", text: "Second E note", tags: ["E"] },
      ];

      await routeNotes(notes, deps);

      const store = (deps.eStorage as any).store as Map<string, string>;
      expect(store.get("2026-09-01")).toBe(
        "---\ncreatedDate: 2026-08-20\n---\n\nFirst E note",
      );
      expect(store.get("2026-09-02")).toBe(
        "---\ncreatedDate: 2026-08-21\n---\n\nSecond E note",
      );
    });
  });

  describe("Todoist tags (T, I, EQ)", () => {
    it("routes T tag to Todoist with due date set to today", async () => {
      const deps = createMockDeps({ today: () => "2026-09-01" });
      const note: Note = { date: "2026-08-20", text: "Task today", tags: ["T"] };

      await routeNote(note, deps);

      expect(deps.todoist.createTask).toHaveBeenCalledWith({
        content: "Task today",
        dueDate: "2026-09-01",
      });
    });

    it("routes I tag to Todoist with innerhelmProjectId", async () => {
      const deps = createMockDeps();
      const note: Note = { date: "2026-08-20", text: "Writing idea", tags: ["I"] };

      await routeNote(note, deps);

      expect(deps.todoist.createTask).toHaveBeenCalledWith({
        content: "Writing idea",
        projectId: "innerhelm-id",
      });
    });

    it("routes EQ tag to Todoist with eqpProjectId", async () => {
      const deps = createMockDeps();
      const note: Note = { date: "2026-08-20", text: "EQP task", tags: ["EQ"] };

      await routeNote(note, deps);

      expect(deps.todoist.createTask).toHaveBeenCalledWith({
        content: "EQP task",
        projectId: "eqp-id",
      });
    });
  });

  describe("Readwise tag (R)", () => {
    it("routes R tag to Readwise client", async () => {
      const deps = createMockDeps();
      const note: Note = { date: "2026-08-20", text: "Great quote", tags: ["R"] };

      await routeNote(note, deps);

      expect(deps.readwise.createHighlight).toHaveBeenCalledWith("Great quote", "2026-08-20");
    });
  });

  describe("Resend tag (W)", () => {
    it("routes W tag to Resend client", async () => {
      const deps = createMockDeps();
      const note: Note = { date: "2026-08-20", text: "Email note", tags: ["W"] };

      await routeNote(note, deps);

      expect(deps.resend.sendEmail).toHaveBeenCalledWith({
        from: "from@example.com",
        to: "to@example.com",
        subject: "Notebook entry — 2026-08-20",
        text: "Email note",
      });
    });
  });

  describe("Unknown tags", () => {
    it("logs warning for unknown tags and continues", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const deps = createMockDeps();
      const note: Note = { date: "2026-08-20", text: "Unknown tag note", tags: ["UNKNOWN" as any] };

      await routeNote(note, deps);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Skipping unknown tag "UNKNOWN" on note dated 2026-08-20',
      );
      consoleSpy.mockRestore();
    });
  });

  describe("Dry Run mode", () => {
    it("logs dry run actions without triggering side effects or mutations", async () => {
      const logger = vi.fn();
      const deps = createMockDeps({ dryRun: true, logger });

      const notes: Note[] = [
        { date: "2026-08-20", text: "PW note", tags: ["PW"] },
        { date: "2026-08-20", text: "E note", tags: ["E"] },
        { date: "2026-08-20", text: "Todoist note", tags: ["T", "I", "EQ"] },
        { date: "2026-08-20", text: "Readwise note", tags: ["R"] },
        { date: "2026-08-20", text: "Email note", tags: ["W"] },
      ];

      await routeNotes(notes, deps);

      // Verify no actual side effects were made
      const pwStore = (deps.pwStorage as any).store as Map<string, string>;
      const eStore = (deps.eStorage as any).store as Map<string, string>;
      expect(pwStore.size).toBe(0);
      expect(eStore.size).toBe(0);
      expect(deps.todoist.createTask).not.toHaveBeenCalled();
      expect(deps.readwise.createHighlight).not.toHaveBeenCalled();
      expect(deps.resend.sendEmail).not.toHaveBeenCalled();

      // Verify logger received dry run logs
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining("[DRY RUN] [PW] Append note to PW storage"),
      );
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining("[DRY RUN] [E] Save note to E storage"),
      );
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining("[DRY RUN] [T] Create Todoist task in Inbox"),
      );
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining("[DRY RUN] [I] Create Todoist task in Innerhelm project"),
      );
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining("[DRY RUN] [EQ] Create Todoist task in EQP project"),
      );
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining("[DRY RUN] [R] Create Readwise highlight"),
      );
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining("[DRY RUN] [W] Send email via Resend"),
      );
    });
  });
});
