import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getNotebookTail, appendNotebookEntry, Env } from "./github";

export function isAuthorized(request: Request, env: Env): boolean {
  const token = env.MCP_BEARER_TOKEN || env.BEARER_TOKEN;
  if (!token) {
    // Fail closed if token secret is not configured in environment
    return false;
  }
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return false;
  }
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") {
    return false;
  }
  return parts[1] === token;
}

export function createServer(env: Env) {
  const server = new McpServer({
    name: "notebook-router-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "get_notebook_tail",
    {
      description: "Fetches the last N lines of notebook.md from GitHub along with blob sha and total line count.",
      inputSchema: {
        lines: z.number().optional().describe("Number of tail lines to retrieve (default: 10)"),
      },
    },
    async ({ lines }) => {
      try {
        const result = await getNotebookTail(env, lines ?? 10);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching notebook tail: ${err.message || String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "append_notebook_entry",
    {
      description: "Appends transcribed markdown to notebook.md on a new branch and opens a Pull Request on GitHub.",
      inputSchema: {
        content: z.string().describe("Transcribed markdown text to append"),
        expected_sha: z.string().describe("The blob sha of notebook.md returned by get_notebook_tail"),
        branch_name: z.string().optional().describe("Optional custom branch name"),
        pr_title: z.string().optional().describe("Optional custom PR title"),
        pr_body: z.string().optional().describe("Optional custom PR body"),
      },
    },
    async ({ content, expected_sha, branch_name, pr_title, pr_body }) => {
      try {
        const result = await appendNotebookEntry(env, {
          content,
          expectedSha: expected_sha,
          branchName: branch_name,
          prTitle: pr_title,
          prBody: pr_body,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error appending notebook entry: ${err.message || String(err)}`,
            },
          ],
        };
      }
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
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

    const pathname = new URL(request.url).pathname;
    const mcpHandler = createMcpHandler((_mcpCtx) => createServer(env), {
      route: pathname,
    });

    const executionCtx = ctx || ({
      waitUntil() {},
      passThroughOnException() {},
    } as unknown as ExecutionContext);

    return mcpHandler(request, env, executionCtx);
  },
};
