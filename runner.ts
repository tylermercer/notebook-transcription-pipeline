#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config";
import { parseTranscript } from "./parse";
import { routeNote } from "./router";
import { FileKVStorage } from "./storage";
import { TodoistClient } from "./todoist";
import { ReadwiseClient } from "./readwise";
import { ResendClient } from "./resend";
import { existsSync } from "node:fs";

/**
 * Checks off a specific tag in the transcript content at or after firstUnprocessedIndex.
 * Replaces the first occurrence of `☐TAG` or `☐ TAG` with `☑ TAG` starting from the first unprocessed position.
 */
export function checkOffTagInContent(content: string, tag: string): string {
  // Find index of first unprocessed checkbox '☐'
  const firstUnprocessedIndex = content.indexOf("☐");
  if (firstUnprocessedIndex === -1) return content;

  // Pattern matches ☐ TAG or ☐TAG
  const pattern = new RegExp(`☐\\s*${tag}\\b`);
  const match = content.slice(firstUnprocessedIndex).match(pattern);

  if (!match || match.index === undefined) {
    return content;
  }

  const matchPos = firstUnprocessedIndex + match.index;
  const replaced = content.slice(0, matchPos) + `☑ ${tag}` + content.slice(matchPos + match[0].length);
  return replaced;
}

async function processFile(filePath: string, isDryRun: boolean, config: any) {
  if (!existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }

  let text = await Bun.file(filePath).text();
  const notes = parseTranscript(text);

  if (notes.length === 0) {
    console.log(`No unprocessed items found in ${filePath}.`);
    return;
  }

  if (isDryRun) {
    console.log(`--- Dry run for ${filePath} ---`);
  }

  const pwStorage = new FileKVStorage(config.storage.pwFolder);
  const eStorage = new FileKVStorage(config.storage.eFolder);
  const todoist = new TodoistClient(config.todoist.apiToken);
  const readwise = new ReadwiseClient(config.readwise.apiToken);
  const resend = new ResendClient(config.resend.apiKey);

  const claimedDates = new Set<string>();
  let totalProcessed = 0;

  for (const note of notes) {
    for (const tag of note.tags) {
      const singleTagNote = { ...note, tags: [tag] };

      await routeNote(singleTagNote, {
        config,
        pwStorage,
        eStorage,
        todoist,
        readwise,
        resend,
        dryRun: isDryRun,
      }, claimedDates);

      totalProcessed++;

      if (!isDryRun) {
        // Read latest file content, check off tag, and write back
        text = await Bun.file(filePath).text();
        const updatedText = checkOffTagInContent(text, tag);
        await Bun.write(filePath, updatedText);
      }
    }
  }

  if (isDryRun) {
    console.log(`[DRY RUN] Would process ${totalProcessed} tag action(s) across ${notes.length} note(s) from ${filePath}.\n`);
  } else {
    console.log(`Routed ${totalProcessed} tag action(s) across ${notes.length} note(s) from ${filePath}.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun =
    args.includes("--dry-run") ||
    process.env.DRY_RUN === "1" ||
    process.env.DRY_RUN === "true";
  let filePaths = args.filter((arg) => arg !== "--dry-run");

  if (filePaths.length === 0) {
    filePaths = ["notebook.md"];
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
    await processFile(filePath, isDryRun, config);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
