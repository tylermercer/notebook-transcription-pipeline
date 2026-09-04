#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadConfig, type AppConfig } from "./config";
import { parseTranscript } from "./parse";
import { routeNote } from "./router";
import { FileKVStorage } from "./storage";
import { TodoistClient } from "./todoist";
import { ReadwiseClient } from "./readwise";
import { ResendClient } from "./resend";
import { existsSync } from "node:fs";

export async function ensureStorageFolders(config: AppConfig): Promise<void> {
  await mkdir(config.storage.pwFolder, { recursive: true });
  await mkdir(config.storage.eFolder, { recursive: true });
}

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

export interface ProcessFileResult {
  notesProcessed: number;
  tagActionsProcessed: number;
  logLines: string[];
}

export async function processFile(
  filePath: string,
  isDryRun: boolean,
  config: AppConfig,
  logger: (msg: string) => void = console.log,
): Promise<ProcessFileResult> {
  const logLines: string[] = [];
  const customLogger = (msg: string) => {
    logLines.push(msg);
    logger(msg);
  };

  if (!existsSync(filePath)) {
    const warning = `File not found: ${filePath}`;
    console.warn(warning);
    return { notesProcessed: 0, tagActionsProcessed: 0, logLines: [warning] };
  }

  let text = await readFile(filePath, "utf-8");
  const notes = parseTranscript(text);

  if (notes.length === 0) {
    const msg = `No unprocessed items found in ${filePath}.`;
    customLogger(msg);
    return { notesProcessed: 0, tagActionsProcessed: 0, logLines };
  }

  if (isDryRun) {
    customLogger(`--- Dry run for ${filePath} ---`);
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
        logger: customLogger,
      }, claimedDates);

      totalProcessed++;

      if (!isDryRun) {
        // Read latest file content, check off tag, and write back
        text = await readFile(filePath, "utf-8");
        const updatedText = checkOffTagInContent(text, tag);
        await writeFile(filePath, updatedText, "utf-8");
      }
    }
  }

  if (isDryRun) {
    customLogger(`[DRY RUN] Would process ${totalProcessed} tag action(s) across ${notes.length} note(s) from ${filePath}.\n`);
  } else {
    customLogger(`Routed ${totalProcessed} tag action(s) across ${notes.length} note(s) from ${filePath}.`);
  }

  return {
    notesProcessed: notes.length,
    tagActionsProcessed: totalProcessed,
    logLines,
  };
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
    await ensureStorageFolders(config);
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
