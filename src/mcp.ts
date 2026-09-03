import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getContextContent } from "./context.js";

export function createMcpServer(agentsMd: string, notebookMd: string): McpServer {
  const server = new McpServer({
    name: "notebook-router-mcp",
    version: "1.0.0",
  });

  server.tool("get_context", {}, async () => {
    const text = getContextContent(agentsMd, notebookMd, 10);
    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  });

  return server;
}
