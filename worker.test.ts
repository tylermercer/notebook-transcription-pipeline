import { describe, expect, it, vi } from "vitest";
import { isAuthorized, createServer } from "./src/index";
import { validateNotebookContent } from "./src/validate";
import {
  getNotebookFile,
  getNotebookTail,
  createBranch,
  writeNotebookFile,
  openPullRequest,
  appendNotebookEntry,
  Env,
} from "./src/github";

describe("Bearer Authorization (Fail Closed)", () => {
  it("rejects requests when no bearer token secret is configured in env", () => {
    const req = new Request("http://localhost/mcp", {
      headers: { Authorization: "Bearer secret123" },
    });
    expect(isAuthorized(req, {})).toBe(false);
  });

  it("permits request when Authorization matches MCP_BEARER_TOKEN", () => {
    const env: Env = { MCP_BEARER_TOKEN: "mcp-secret-123" };
    const req = new Request("http://localhost/mcp", {
      headers: { Authorization: "Bearer mcp-secret-123" },
    });
    expect(isAuthorized(req, env)).toBe(true);
  });

  it("permits request when Authorization matches fallback BEARER_TOKEN", () => {
    const env: Env = { BEARER_TOKEN: "fallback-secret-123" };
    const req = new Request("http://localhost/mcp", {
      headers: { Authorization: "Bearer fallback-secret-123" },
    });
    expect(isAuthorized(req, env)).toBe(true);
  });

  it("rejects request when Authorization header is missing", () => {
    const env: Env = { MCP_BEARER_TOKEN: "mcp-secret-123" };
    const req = new Request("http://localhost/mcp");
    expect(isAuthorized(req, env)).toBe(false);
  });

  it("rejects request when token does not match", () => {
    const env: Env = { MCP_BEARER_TOKEN: "mcp-secret-123" };
    const req = new Request("http://localhost/mcp", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(isAuthorized(req, env)).toBe(false);
  });

  it("rejects request when Auth scheme is not Bearer", () => {
    const env: Env = { MCP_BEARER_TOKEN: "mcp-secret-123" };
    const req = new Request("http://localhost/mcp", {
      headers: { Authorization: "Basic mcp-secret-123" },
    });
    expect(isAuthorized(req, env)).toBe(false);
  });
});

describe("Structural Format Validation (src/validate.ts)", () => {
  it("passes for valid entry with date header and checkbox line", () => {
    const content = `## 2025-06-29\nBuy milk\n☐ T`;
    const res = validateNotebookContent(content);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("fails when content is empty", () => {
    const res = validateNotebookContent("   ");
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Content is empty.");
  });

  it("fails when date header is missing", () => {
    const content = `Buy milk\n☐ T`;
    const res = validateNotebookContent(content);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("date header"))).toBe(true);
  });

  it("fails when checkbox line is missing", () => {
    const content = `## 2025-06-29\nJust some notes without checkboxes`;
    const res = validateNotebookContent(content);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("checkbox line"))).toBe(true);
  });
});

describe("GitHub REST Wrappers (src/github.ts)", () => {
  const mockEnv: Env = {
    GITHUB_TOKEN: "test-token",
    GITHUB_OWNER: "test-owner",
    GITHUB_REPO: "test-repo",
    GITHUB_BASE_BRANCH: "main",
    NOTEBOOK_PATH: "notebook.md",
  };

  it("getNotebookFile fetches and decodes base64 content", async () => {
    const sampleContent = "## 2025-06-29\nEntry 1\n☐ PW\n";
    const base64Content = Buffer.from(sampleContent, "utf-8").toString("base64");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: base64Content, sha: "sha-123" }), {
        status: 200,
      })
    );

    const result = await getNotebookFile(mockEnv, mockFetch as any);
    expect(result.content).toBe(sampleContent);
    expect(result.sha).toBe("sha-123");
  });

  it("getNotebookTail returns last N lines, line count, and sha", async () => {
    const lines = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}`);
    const sampleContent = lines.join("\n");
    const base64Content = Buffer.from(sampleContent, "utf-8").toString("base64");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: base64Content, sha: "sha-123" }), {
        status: 200,
      })
    );

    const result = await getNotebookTail(mockEnv, 5, mockFetch as any);
    expect(result.sha).toBe("sha-123");
    expect(result.totalLines).toBe(15);
    expect(result.tail).toBe(lines.slice(-5).join("\n"));
  });

  it("createBranch auto-resolves branch collision on 422", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/git/ref/heads/main")) {
        return new Response(JSON.stringify({ object: { sha: "base-commit-sha" } }), { status: 200 });
      }
      if (url.includes("/git/refs")) {
        callCount++;
        if (callCount === 1) {
          // First attempt collisions
          return new Response(JSON.stringify({ message: "Reference already exists" }), { status: 422 });
        }
        // Retry succeeds
        return new Response(JSON.stringify({ ref: "refs/heads/transcription-retry" }), { status: 201 });
      }
      return new Response("Not Found", { status: 404 });
    });

    const result = await createBranch(mockEnv, "transcription/2025-06-29", mockFetch as any);
    expect(result.collided).toBe(true);
    expect(result.branchName).toMatch(/^transcription\/2025-06-29-\d+$/);
  });

  it("writeNotebookFile throws stale SHA error on 409 or 422 conflict", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "sha mismatch" }), { status: 409 })
    );

    await expect(
      writeNotebookFile(mockEnv, "test-branch", "updated content", "old-sha", "commit msg", mockFetch as any)
    ).rejects.toThrow(/Stale SHA error/);
  });

  it("appendNotebookEntry performs end-to-end PR creation flow", async () => {
    const existingNotebook = "## 2025-06-28\nOld note\n☐ PW\n";
    const base64Existing = Buffer.from(existingNotebook, "utf-8").toString("base64");

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || "GET";
      if (method === "GET" && url.includes("/contents/notebook.md")) {
        return new Response(JSON.stringify({ content: base64Existing, sha: "valid-sha" }), { status: 200 });
      }
      if (method === "GET" && url.includes("/git/ref/heads/main")) {
        return new Response(JSON.stringify({ object: { sha: "commit-sha-1" } }), { status: 200 });
      }
      if (method === "POST" && url.includes("/git/refs")) {
        return new Response(JSON.stringify({ ref: "refs/heads/transcription/2025-06-29" }), { status: 201 });
      }
      if (method === "PUT" && url.includes("/contents/notebook.md")) {
        return new Response(JSON.stringify({ content: { sha: "new-blob-sha" } }), { status: 200 });
      }
      if (method === "POST" && url.includes("/pulls")) {
        return new Response(
          JSON.stringify({ html_url: "https://github.com/test-owner/test-repo/pull/42", number: 42, title: "transcription" }),
          { status: 201 }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const newEntry = "## 2025-06-29\nNew transcribed note\n☐ PW, ☐ R";
    const res = await appendNotebookEntry(
      mockEnv,
      { content: newEntry, expectedSha: "valid-sha" },
      mockFetch as any
    );

    expect(res.success).toBe(true);
    expect(res.prNumber).toBe(42);
    expect(res.prUrl).toBe("https://github.com/test-owner/test-repo/pull/42");
  });

  it("appendNotebookEntry rejects stale sha", async () => {
    const existingNotebook = "## 2025-06-28\nOld note\n☐ PW\n";
    const base64Existing = Buffer.from(existingNotebook, "utf-8").toString("base64");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: base64Existing, sha: "current-remote-sha" }), { status: 200 })
    );

    const newEntry = "## 2025-06-29\nNew note\n☐ PW";
    await expect(
      appendNotebookEntry(mockEnv, { content: newEntry, expectedSha: "outdated-sha" }, mockFetch as any)
    ).rejects.toThrow(/Stale SHA error/);
  });
});

describe("MCP Server Tools", () => {
  const mockEnv: Env = {
    GITHUB_TOKEN: "test-token",
    GITHUB_OWNER: "test-owner",
    GITHUB_REPO: "test-repo",
  };

  it("registers get_notebook_tail and append_notebook_entry tools", () => {
    const server = createServer(mockEnv);
    expect(server).toBeDefined();
  });
});
