import { describe, expect, it } from "vitest";
import { getContextContent, getNotebookTail } from "./src/context.js";
import { createMcpServer } from "./src/mcp.js";
import { handleFetch, isAuthorized } from "./src/worker.js";

describe("Notebook Tail Logic", () => {
  it("returns the last 10 lines of notebook content", () => {
    const lines = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}`);
    const content = lines.join("\n");
    const tail = getNotebookTail(content, 10);
    const expected = Array.from({ length: 10 }, (_, i) => `Line ${i + 6}`).join("\n");
    expect(tail).toBe(expected);
  });

  it("handles notebook content with fewer than 10 lines", () => {
    const content = "Line 1\nLine 2\nLine 3";
    const tail = getNotebookTail(content, 10);
    expect(tail).toBe(content);
  });

  it("returns empty string for empty content", () => {
    expect(getNotebookTail("")).toBe("");
  });
});

describe("Context Formatting", () => {
  it("combines AGENTS.md instructions and notebook tail", () => {
    const agents = "# Instructions\nRule 1";
    const notebook = "Entry 1\nEntry 2";
    const result = getContextContent(agents, notebook, 10);
    expect(result).toContain("## AGENTS.md Instructions\n\n# Instructions\nRule 1");
    expect(result).toContain("## notebook.md (Tail)\n\nEntry 1\nEntry 2");
  });
});

describe("Bearer Token Authorization", () => {
  const env = { BEARER_TOKEN: "secret-token-123" };

  it("permits request when token matches BEARER_TOKEN", () => {
    const req = new Request("http://localhost/sse", {
      headers: { Authorization: "Bearer secret-token-123" },
    });
    expect(isAuthorized(req, env)).toBe(true);
  });

  it("permits request when token matches AUTH_TOKEN", () => {
    const req = new Request("http://localhost/sse", {
      headers: { Authorization: "Bearer my-auth-token" },
    });
    expect(isAuthorized(req, { AUTH_TOKEN: "my-auth-token" })).toBe(true);
  });

  it("rejects request when Authorization header is missing", () => {
    const req = new Request("http://localhost/sse");
    expect(isAuthorized(req, env)).toBe(false);
  });

  it("rejects request when token is wrong", () => {
    const req = new Request("http://localhost/sse", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(isAuthorized(req, env)).toBe(false);
  });

  it("rejects request with invalid Auth scheme", () => {
    const req = new Request("http://localhost/sse", {
      headers: { Authorization: "Basic secret-token-123" },
    });
    expect(isAuthorized(req, env)).toBe(false);
  });

  it("allows requests if no BEARER_TOKEN or AUTH_TOKEN is set in env", () => {
    const req = new Request("http://localhost/sse");
    expect(isAuthorized(req, {})).toBe(true);
  });
});

describe("MCP Server get_context Tool", () => {
  it("executes get_context tool and returns expected content array", async () => {
    const server = createMcpServer("Test Instructions", "Line 1\nLine 2");
    const sentMessages: any[] = [];

    const mockTransport: any = {
      start: async () => {},
      close: async () => {},
      send: async (msg: any) => {
        sentMessages.push(msg);
      },
      onmessage: null,
    };

    await server.connect(mockTransport);

    await mockTransport.onmessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    });

    await mockTransport.onmessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    await mockTransport.onmessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "get_context",
        arguments: {},
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    const toolCallResponse = sentMessages.find((m) => m.id === 2);
    expect(toolCallResponse).toBeDefined();
    expect(toolCallResponse.result).toBeDefined();
    expect(toolCallResponse.result.content).toBeDefined();
    expect(Array.isArray(toolCallResponse.result.content)).toBe(true);
    expect(toolCallResponse.result.content[0].type).toBe("text");
    expect(toolCallResponse.result.content[0].text).toContain("Test Instructions");
    expect(toolCallResponse.result.content[0].text).toContain("Line 1\nLine 2");
  });
});

describe("Worker Fetch Handler", () => {
  const env = { BEARER_TOKEN: "secure-key" };

  it("returns 401 when unauthorized", async () => {
    const req = new Request("http://localhost/sse");
    const res = await handleFetch(req, env);
    expect(res.status).toBe(401);
  });

  it("handles OPTIONS request with CORS headers", async () => {
    const req = new Request("http://localhost/sse", { method: "OPTIONS" });
    const res = await handleFetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 404 for unknown endpoints", async () => {
    const req = new Request("http://localhost/unknown", {
      headers: { Authorization: "Bearer secure-key" },
    });
    const res = await handleFetch(req, env);
    expect(res.status).toBe(404);
  });

  it("returns 200 text/event-stream for /sse when authorized", async () => {
    const req = new Request("http://localhost/sse", {
      headers: { Authorization: "Bearer secure-key" },
    });
    const res = await handleFetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });
});
