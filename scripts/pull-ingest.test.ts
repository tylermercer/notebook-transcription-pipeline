import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import worker, { categorizeTextWithJev } from "../apps/worker/src/index";
import { formatNoteToMarkdown, pullNotesFromD1 } from "./pull-d1";
import type { AppConfig } from "../config";
import { readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

describe("Worker & Jev AI Ingest", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("categorizeTextWithJev maps Jev Noul questions to notebook tags", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          tag_pw: { noul: 0.1 },
          tag_t: { noul: 0.9 },
          tag_w: { noul: 0.8 },
        },
      }),
    } as any));

    const tags = await categorizeTextWithJev("Buy groceries and email Dan", "dummy-api-key");
    expect(tags).toEqual(["T", "W"]);
  });

  it("categorizeTextWithJev defaults to PW when no question scores above 0.5 threshold", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          tag_pw: { noul: 0.2 },
          tag_t: { noul: 0.3 },
        },
      }),
    } as any));

    const tags = await categorizeTextWithJev("Unclear text", "dummy-api-key");
    expect(tags).toEqual(["PW"]);
  });

  it("Worker returns 401 Unauthorized if WEBHOOK_AUTH_TOKEN is wrong", async () => {
    const request = new Request("http://localhost/ingest", {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "Test note" }),
    });

    const env = {
      DB: {} as any,
      WEBHOOK_AUTH_TOKEN: "secret-token",
    };

    const res = await worker.fetch(request, env);
    expect(res.status).toBe(401);
  });

  it("Worker ingests note, calls Jev, and stores in D1", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          tag_t: { noul: 0.95 },
        },
      }),
    } as any));

    const preparedStmt = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    const mockDb = {
      prepare: vi.fn().mockReturnValue(preparedStmt),
    };

    const request = new Request("http://localhost/ingest", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "Schedule dentist appointment" }),
    });

    const env = {
      DB: mockDb as any,
      WEBHOOK_AUTH_TOKEN: "secret-token",
      TYPESAFE_API_KEY: "typesafe-key",
    };

    const res = await worker.fetch(request, env);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.text).toBe("Schedule dentist appointment");
    expect(data.tags).toEqual(["T"]);
    expect(mockDb.prepare).toHaveBeenCalled();
  });
});

describe("D1 Pull Script (scripts/pull-d1.ts)", () => {
  const testWebhookNotebook = "./test-webhook-notebook.md";

  afterEach(async () => {
    if (existsSync(testWebhookNotebook)) {
      await rm(testWebhookNotebook);
    }
  });

  it("formatNoteToMarkdown formats uncompleted and completed checkboxes accurately", () => {
    const markdown = formatNoteToMarkdown({
      date: "2026-09-10",
      text: "Read article",
      tags: ["R", "PW"],
      completed_tags: ["R"],
    });

    expect(markdown).toBe("\n## 2026-09-10\nRead article\n[x] R, [ ] PW\n");
  });

  it("pullNotesFromD1 writes formatted notes to webhookNotebookPath", async () => {
    const config: AppConfig = {
      port: 8000,
      notebookPath: "notebook.md",
      webhookNotebookPath: testWebhookNotebook,
      editor: "code --wait",
      destinations: { pw: true, e: true, t: true, i: true, eq: true, r: true, w: true },
      anthropic: { apiKey: "a" },
      todoist: { apiToken: "b", innerhelmProjectId: "c", eqpProjectId: "d" },
      readwise: { apiToken: "e" },
      resend: { apiKey: "f", fromEmail: "g", toEmail: "h" },
      storage: { pwFolder: "./pw", eFolder: "./e" },
    };

    // Mock fetchNotesFromD1 and deleteNotesFromD1
    const mockRecords = [
      {
        id: "id-1",
        date: "2026-09-10",
        text: "Important idea",
        tags: JSON.stringify(["PW", "T"]),
        completed_tags: JSON.stringify(["T"]),
        created_at: "2026-09-10T12:00:00Z",
      },
    ];

    const result = await pullNotesFromD1(config, {
      fetchNotes: () => mockRecords,
      deleteNotes: () => {},
    });
    expect(result.pulledCount).toBe(1);

    const content = await readFile(testWebhookNotebook, "utf-8");
    expect(content).toContain("## 2026-09-10");
    expect(content).toContain("Important idea");
    expect(content).toContain("[ ] PW, [x] T");
  });
});
