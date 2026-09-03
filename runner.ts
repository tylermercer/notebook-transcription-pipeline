#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config";
import { parseTranscript } from "./parse";
import { routeNotes } from "./router";
import { FileKVStorage } from "./storage";
import { TodoistClient } from "./todoist";
import { ReadwiseClient } from "./readwise";
import { ResendClient } from "./resend";

async function main() {
  const args = process.argv.slice(2);
  const isDryRun =
    args.includes("--dry-run") ||
    process.env.DRY_RUN === "1" ||
    process.env.DRY_RUN === "true";
  const filePaths = args.filter((arg) => arg !== "--dry-run");

  if (filePaths.length === 0) {
    console.error(
      "Usage: bun run src/runner.ts [--dry-run] <transcript-file> [transcript-file2 ...]",
    );
    process.exit(1);
  }

  const config = loadConfig(
    process.env as Record<string, string | undefined>,
    { allowMissing: isDryRun },
  );

  if (!isDryRun) {
    await mkdir(config.storage.pwFolder, { recursive: true });
    await mkdir(config.storage.eFolder, { recursive: true });
  }

  for (const filePath of filePaths) {
    const text = await Bun.file(filePath).text();
    const notes = parseTranscript(text);

    if (isDryRun) {
      console.log(`--- Dry run for ${filePath} ---`);
    }

    await routeNotes(notes, {
      config,
      pwStorage: new FileKVStorage(config.storage.pwFolder),
      eStorage: new FileKVStorage(config.storage.eFolder),
      todoist: new TodoistClient(config.todoist.apiToken),
      readwise: new ReadwiseClient(config.readwise.apiToken),
      resend: new ResendClient(config.resend.apiKey),
      dryRun: isDryRun,
    });

    if (isDryRun) {
      console.log(`[DRY RUN] Processed ${notes.length} note(s) from ${filePath}.\n`);
    } else {
      console.log(`Routed ${notes.length} note(s) from ${filePath}.`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
