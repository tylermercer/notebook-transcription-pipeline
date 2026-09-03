import agentsMd from "../AGENTS.md?raw";
import notebookMd from "../notebook.md?raw";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "./mcp.js";

export interface Env {
  BEARER_TOKEN?: string;
}

export const activeSessions = new Map<string, SSEServerTransport>();

export function isAuthorized(request: Request, env: Env): boolean {
  const token = env.BEARER_TOKEN;
  if (!token) {
    return true;
  }
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return false;
  }
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return false;
  }
  return parts[1] === token;
}

export async function handleSseRequest(request: Request, agentsContent: string, notebookContent: string): Promise<Response> {
  const url = new URL(request.url);
  const basePath = url.pathname.endsWith("/sse")
    ? url.pathname.substring(0, url.pathname.length - 4)
    : url.pathname;
  const messageEndpoint = `${basePath}/message`;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const mockRes = {
    writeHead() {},
    write(chunk: string) {
      writer.write(encoder.encode(chunk)).catch(() => {});
    },
    end() {
      writer.close().catch(() => {});
    },
    on(event: string, listener: () => void) {
      if (event === "close") {
        request.signal.addEventListener("abort", listener);
      }
    },
  };

  const transport = new SSEServerTransport(messageEndpoint, mockRes as any);
  const server = createMcpServer(agentsContent, notebookContent);

  await server.connect(transport);

  activeSessions.set(transport.sessionId, transport);

  request.signal.addEventListener("abort", () => {
    activeSessions.delete(transport.sessionId);
    transport.close().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function handlePostMessage(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("Missing sessionId parameter", { status: 400 });
  }

  const transport = activeSessions.get(sessionId);
  if (!transport) {
    return new Response("Session not found", { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    await transport.handleMessage(body);
    return new Response("Accepted", {
      status: 202,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(`Error handling message: ${err}`, { status: 400 });
  }
}

export async function handleFetch(request: Request, env: Env = {}): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="MCP Server"',
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const url = new URL(request.url);

  if (request.method === "GET" && (url.pathname === "/sse" || url.pathname === "/mcp/sse" || url.pathname === "/mcp")) {
    return await handleSseRequest(request, agentsMd, notebookMd);
  }

  if (request.method === "POST" && (url.pathname === "/message" || url.pathname === "/mcp/message")) {
    return handlePostMessage(request);
  }

  return new Response("Not Found", { status: 404 });
}

export default {
  fetch: handleFetch,
};
