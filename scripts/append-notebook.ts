#!/usr/bin/env bun
import { appendNotebookEntry } from "../lib/notebook";
import { loadConfig } from "../config";

async function appendNotebook() {
  const args = process.argv.slice(2);
  const textToAppend = args.join(" ");

  if (!textToAppend.trim()) {
    console.error('Usage: bun run scripts/append-notebook.ts "<text to append>"');
    process.exit(1);
  }

  const config = loadConfig(process.env as Record<string, string | undefined>, { allowMissing: true });
  const filePath = process.env.NOTEBOOK_FILE || config.notebookPath;
  await appendNotebookEntry(filePath, textToAppend);
  console.log(`Appended entry to ${filePath}.`);
}

appendNotebook().catch((err) => {
  console.error(err);
  process.exit(1);
});
