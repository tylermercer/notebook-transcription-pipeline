import { execSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { loadConfig, type AppConfig } from "../config";

export interface D1NoteRecord {
  id: string;
  date: string;
  text: string;
  tags: string; // JSON array of string e.g. '["PW","T"]'
  completed_tags: string; // JSON array of string e.g. '["T"]' or '[]'
  created_at: string;
}

export function formatNoteToMarkdown(record: {
  date: string;
  text: string;
  tags: string[];
  completed_tags: string[];
}): string {
  const allTags = record.tags || [];
  const completedSet = new Set(record.completed_tags || []);

  const tagTokens = allTags.map((t) => {
    const isCompleted = completedSet.has(t);
    return isCompleted ? `[x] ${t}` : `[ ] ${t}`;
  });

  const tagLine = tagTokens.length > 0 ? tagTokens.join(", ") : "[ ] PW";

  return `\n## ${record.date}\n${record.text}\n${tagLine}\n`;
}

export interface FetchD1NotesOptions {
  local?: boolean;
  databaseName?: string;
  cwd?: string;
  fetchNotes?: (options: FetchD1NotesOptions) => D1NoteRecord[];
  deleteNotes?: (ids: string[], options: FetchD1NotesOptions) => void;
}

export function fetchNotesFromD1(options: FetchD1NotesOptions = {}): D1NoteRecord[] {
  const dbName = options.databaseName || "notebook_db";
  const flags = options.local ? "--local" : "--remote";
  const cmd = `npx wrangler d1 execute ${dbName} ${flags} --command "SELECT id, date, text, tags, completed_tags, created_at FROM notes ORDER BY created_at ASC;" --json`;

  try {
    const stdout = execSync(cmd, {
      cwd: options.cwd || process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const parsed = JSON.parse(stdout);
    // Wrangler outputs array of result objects
    if (Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].results)) {
      return parsed[0].results as D1NoteRecord[];
    }
    return [];
  } catch (err: any) {
    console.warn("Wrangler D1 execute failed or returned empty:", err.message || err);
    return [];
  }
}

export function deleteNotesFromD1(ids: string[], options: FetchD1NotesOptions = {}): void {
  if (ids.length === 0) return;
  const dbName = options.databaseName || "notebook_db";
  const flags = options.local ? "--local" : "--remote";
  const idList = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  const cmd = `npx wrangler d1 execute ${dbName} ${flags} --command "DELETE FROM notes WHERE id IN (${idList});" --json`;

  try {
    execSync(cmd, {
      cwd: options.cwd || process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err: any) {
    console.error("Failed to delete records from D1:", err.message || err);
  }
}

export async function pullNotesFromD1(
  config: AppConfig,
  options: FetchD1NotesOptions = {},
): Promise<{ pulledCount: number; destinationFile: string }> {
  const fetcher = options.fetchNotes || fetchNotesFromD1;
  const deleter = options.deleteNotes || deleteNotesFromD1;
  const records = fetcher(options);
  if (records.length === 0) {
    console.log("No notes to pull from D1.");
    return { pulledCount: 0, destinationFile: config.webhookNotebookPath };
  }

  const idsToDelete: string[] = [];
  let markdownToAppend = "";

  for (const record of records) {
    let parsedTags: string[] = [];
    let parsedCompletedTags: string[] = [];

    try {
      parsedTags = typeof record.tags === "string" ? JSON.parse(record.tags) : record.tags;
    } catch {
      parsedTags = ["PW"];
    }

    try {
      parsedCompletedTags =
        typeof record.completed_tags === "string"
          ? JSON.parse(record.completed_tags)
          : record.completed_tags;
    } catch {
      parsedCompletedTags = [];
    }

    markdownToAppend += formatNoteToMarkdown({
      date: record.date,
      text: record.text,
      tags: parsedTags,
      completed_tags: parsedCompletedTags,
    });

    idsToDelete.push(record.id);
  }

  // Append markdown to webhookNotebookPath
  await appendFile(config.webhookNotebookPath, markdownToAppend, "utf-8");
  console.log(`Appended ${records.length} note(s) to ${config.webhookNotebookPath}.`);

  // Delete pulled notes from D1
  deleter(idsToDelete, options);
  console.log(`Deleted ${idsToDelete.length} record(s) from D1 database.`);

  return { pulledCount: records.length, destinationFile: config.webhookNotebookPath };
}

async function main() {
  const isLocal = process.argv.includes("--local");
  const config = loadConfig(process.env as Record<string, string | undefined>, {
    allowMissing: true,
  });

  await pullNotesFromD1(config, { local: isLocal });
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Pull from D1 failed:", err);
    process.exit(1);
  });
}
