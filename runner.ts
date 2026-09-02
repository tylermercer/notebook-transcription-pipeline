#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config";
import { parseTranscript } from "./parse";
import { routeNotes } from "./router";
import { FileKVStorage } from "./storage";
import { TodoistClient } from "./clients/todoist";
import { ReadwiseClient } from "./clients/readwise";
import { ResendClient } from "./clients/resend";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: bun run src/runner.ts <transcript-file>");
    process.exit(1);
  }

  const text = await Bun.file(filePath).text();
  const notes = parseTranscript(text);
  const config = loadConfig(process.env as Record<string, string | undefined>);

  await mkdir(config.storage.pwFolder, { recursive: true });
  await mkdir(config.storage.eFolder, { recursive: true });

  await routeNotes(notes, {
    config,
    pwStorage: new FileKVStorage(config.storage.pwFolder),
    eStorage: new FileKVStorage(config.storage.eFolder),
    todoist: new TodoistClient(config.todoist.apiToken),
    readwise: new ReadwiseClient(config.readwise.apiToken),
    resend: new ResendClient(config.resend.apiKey),
  });

  console.log(`Routed ${notes.length} note(s) from ${filePath}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
