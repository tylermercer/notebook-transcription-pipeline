#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "./config";
import { processFile, ensureStorageFolders } from "./runner";
import { AnthropicClient } from "./clients/anthropic";
import { readNotebookTail, appendNotebookEntry } from "./lib/notebook";
import { printQr } from "./lib/qr";
import { getLanIp, validateToken } from "./lib/server-helpers";

async function main() {
  const args = process.argv.slice(2);
  let customPort: number | undefined;
  let customFilePath: string | undefined;
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && i + 1 < args.length) {
      customPort = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i].startsWith("--port=")) {
      customPort = parseInt(args[i].slice("--port=".length), 10);
    } else if ((args[i] === "--config" || args[i] === "-c") && i + 1 < args.length) {
      configPath = args[i + 1];
      i++;
    } else if (args[i].startsWith("--config=")) {
      configPath = args[i].slice("--config=".length);
    } else if (!args[i].startsWith("-")) {
      customFilePath = args[i];
    }
  }

  // Load config (must have real credentials for Anthropic API calls)
  const config = loadConfig(process.env as Record<string, string | undefined>, { configPath });

  const port = customPort ?? config.port;
  const filePath = customFilePath ?? config.notebookPath;

  await ensureStorageFolders(config);

  const token = crypto.randomUUID();
  const lanIp = getLanIp();
  const url = `http://${lanIp}:${port}/?t=${token}`;

  const anthropic = new AnthropicClient(config.anthropic.apiKey);

  const server = Bun.serve({
    port,
    hostname: "0.0.0.0",
    async fetch(req) {
      const reqUrl = new URL(req.url);

      // Validate security token for all routes
      if (!validateToken(req.url, token)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const actionHeader = req.headers.get("X-Action");

      if (req.method === "GET" && reqUrl.pathname === "/") {
        const htmlPath = join(import.meta.dir, "public", "capture.html");
        const html = await readFile(htmlPath, "utf-8");
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (req.method === "POST" && (reqUrl.pathname === "/transcribe" || actionHeader === "transcribe")) {
        try {
          const formData = await req.formData();
          const files = formData.getAll("images") as File[];

          if (!files || files.length === 0) {
            return new Response(JSON.stringify({ error: "No image files provided." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const images: { data: string; mediaType: string }[] = [];
          for (const file of files) {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString("base64");
            const mediaType = file.type || "image/jpeg";
            images.push({ data: base64, mediaType });
          }

          const recentNotebookTail = await readNotebookTail(filePath, 10);
          const transcript = await anthropic.transcribeImages({
            images,
            recentNotebookTail,
          });

          return new Response(JSON.stringify({ transcript }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("Transcribe error:", err);
          return new Response(JSON.stringify({ error: err.message || "Transcription failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (req.method === "POST" && (reqUrl.pathname === "/commit" || actionHeader === "commit")) {
        try {
          const body = (await req.json()) as { transcript?: string };
          const transcript = body.transcript || "";

          if (!transcript.trim()) {
            return new Response(JSON.stringify({ error: "Transcript is empty." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          await appendNotebookEntry(filePath, transcript);

          const result = await processFile(filePath, false, config);

          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("Commit error:", err);
          return new Response(JSON.stringify({ error: err.message || "Commit failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`\nMobile Capture & Transcription Server running at:\n${url}\n`);
  printQr(url);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
